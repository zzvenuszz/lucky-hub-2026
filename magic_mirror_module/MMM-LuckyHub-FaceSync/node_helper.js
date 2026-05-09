
const NodeHelper = require("node_helper");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const https = require("https");
const WebSocket = require("ws");
const ttsHelper = require("./tts_helper");

// Bỏ qua kiểm tra SSL nếu Raspberry Pi gặp lỗi chứng chỉ
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

module.exports = NodeHelper.create({
  start: function() {
    console.log("MMM-LuckyHub-FaceSync: Helper started. Waiting for CONFIG notification from frontend...");
    this.config = null;
    this.serverConfig = null;
    this.faceDir = path.resolve(__dirname, "faces");
    this.isSyncing = false;
    this.pythonProcess = null;
    this.wsClient = null;
    fs.ensureDirSync(this.faceDir);

    // Fallback: Nếu sau 10 giây không nhận được CONFIG, tự chạy với cấu hình mặc định
    setTimeout(() => {
      if (!this.config) {
        console.log("MMM-LuckyHub-FaceSync: No CONFIG received after 10s. Starting with default settings...");
        this.config = {
          baseUrl: "https://lucky-hub-gx7s.onrender.com",
          syncInterval: 30 * 60 * 1000
        };
        this.fetchServerConfig().then(() => {
          this.startSyncLoop();
          this.startRecognition();
        });
      }
    }, 10000);
  },

  fetchServerConfig: async function() {
    try {
      const url = this.config.baseUrl + "/MM/config";
      console.log("MMM-LuckyHub-FaceSync: Fetching server config from " + url);
      const response = await axiosInstance.get(url);
      this.serverConfig = response.data;
      console.log("MMM-LuckyHub-FaceSync: Server config received. Gemini API Key status: " + (this.serverConfig.geminiApiKey ? "Available" : "Missing"));
    } catch (err) {
      console.error("MMM-LuckyHub-FaceSync: Error fetching server config: " + err.message);
    }
  },

  socketNotificationReceived: function(notification, payload) {
    console.log("MMM-LuckyHub-FaceSync: Received socket notification: " + notification);
    if (notification === "CONFIG") {
      const isFirstConfig = !this.config;
      this.config = payload;
      console.log("MMM-LuckyHub-FaceSync: Config received. BaseURL: " + this.config.baseUrl);
      
      this.fetchServerConfig().then(() => {
        if (isFirstConfig) {
          this.startSyncLoop();
          this.startRecognition();
          this.connectToWebSocket();
        } else {
          console.log("MMM-LuckyHub-FaceSync: Config updated, restarting recognition...");
          this.startRecognition();
          this.connectToWebSocket();
        }
      });
    }
  },

  connectToWebSocket: function() {
    if (this.wsClient) {
      this.wsClient.terminate();
      this.wsClient = null;
    }

    const wsUrl = this.config.baseUrl.replace(/^http/, "ws") + "/";
    console.log("MMM-LuckyHub-FaceSync: Connecting to WebSocket at " + wsUrl);

    this.wsClient = new WebSocket(wsUrl);

    this.wsClient.on("open", () => {
      console.log("MMM-LuckyHub-FaceSync: WebSocket connected.");
    });

    this.wsClient.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        console.log("MMM-LuckyHub-FaceSync: Received WebSocket message: " + message.type);
        if (message.type === "user:created" || message.type === "user:updated") {
          console.log("MMM-LuckyHub-FaceSync: Real-time update detected, triggering sync...");
          this.sync(); // Trigger immediate sync
        }
      } catch (err) {
        console.error("MMM-LuckyHub-FaceSync: Error parsing WebSocket message: " + err.message);
      }
    });

    this.wsClient.on("error", (err) => {
      console.error("MMM-LuckyHub-FaceSync: WebSocket error: " + err.message);
    });

    this.wsClient.on("close", () => {
      console.log("MMM-LuckyHub-FaceSync: WebSocket closed. Reconnecting in 10s...");
      setTimeout(() => this.connectToWebSocket(), 10000);
    });
  },

  startSyncLoop: function() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.sync(); // Initial sync
    this.syncTimer = setInterval(() => this.sync(), this.config.syncInterval);
  },

  sync: async function() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    console.log("MMM-LuckyHub-FaceSync: Starting sync...");
    
    try {
      const url = this.config.baseUrl + "/MM/users/sync";
      console.log("MMM-LuckyHub-FaceSync: Fetching users from " + url);
      const response = await axiosInstance.get(url);
      
      let remoteUsers = response.data;
      // Đảm bảo remoteUsers là một mảng, hỗ trợ cả trường hợp server trả về { users: [...] }
      if (remoteUsers && !Array.isArray(remoteUsers) && Array.isArray(remoteUsers.users)) {
        remoteUsers = remoteUsers.users;
      }

      if (!Array.isArray(remoteUsers)) {
        console.error("MMM-LuckyHub-FaceSync: Invalid response format from server. Expected an array.");
        this.isSyncing = false;
        return;
      }

      console.log(`MMM-LuckyHub-FaceSync: Found ${remoteUsers.length} users on server.`);
      
      const usersWithAvatar = remoteUsers.filter(u => !!u.avatar);
      console.log(`MMM-LuckyHub-FaceSync: ${usersWithAvatar.length} users have avatars to sync.`);

      let hasChanges = false;
      let downloadCount = 0;
      let skipCount = 0;

      for (const user of remoteUsers) {
        if (!user.avatar) {
          console.log(`MMM-LuckyHub-FaceSync: Skipping user @${user.username} because they have no avatar URL.`);
          continue;
        }
        
        const fileName = `${user.username}.jpg`;
        const filePath = path.join(this.faceDir, fileName);
        const metaPath = path.join(this.faceDir, `${user.username}.json`);
        
        let shouldDownload = true;
        const fileExists = fs.existsSync(filePath);
        const metaExists = fs.existsSync(metaPath);

        console.log(`MMM-LuckyHub-FaceSync: Checking user @${user.username} -> JPG: ${fileExists}, JSON: ${metaExists}`);

        if (fileExists && metaExists) {
          try {
            const localMeta = fs.readJsonSync(metaPath);
            // Ưu tiên so sánh avatarHash, nếu không có thì dùng updatedAt
            if (user.avatarHash) {
              if (localMeta.avatarHash === user.avatarHash) {
                console.log(`MMM-LuckyHub-FaceSync: @${user.username} - Hash matches (${user.avatarHash}). Skipping.`);
                shouldDownload = false;
              } else {
                console.log(`MMM-LuckyHub-FaceSync: @${user.username} - Hash mismatch (Local: ${localMeta.avatarHash}, Remote: ${user.avatarHash}). Downloading...`);
              }
            } else if (localMeta.updatedAt === user.updatedAt) {
              console.log(`MMM-LuckyHub-FaceSync: @${user.username} - Date matches (${user.updatedAt}). Skipping.`);
              shouldDownload = false;
            } else {
              console.log(`MMM-LuckyHub-FaceSync: @${user.username} - Date mismatch (Local: ${localMeta.updatedAt}, Remote: ${user.updatedAt}). Downloading...`);
            }
          } catch (e) {
            console.warn(`MMM-LuckyHub-FaceSync: Error reading meta for ${user.username}, will re-download.`);
          }
        } else {
          console.log(`MMM-LuckyHub-FaceSync: File missing for ${user.username}. Force download.`);
        }
        
        if (shouldDownload) {
          try {
            console.log(`MMM-LuckyHub-FaceSync: >>> DOWNLOADING avatar for @${user.username}...`);
            const imgRes = await axiosInstance.get(user.avatar, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, imgRes.data);
            await fs.writeJson(metaPath, { 
              username: user.username, 
              updatedAt: user.updatedAt,
              avatarHash: user.avatarHash 
            });
            hasChanges = true;
            downloadCount++;
          } catch (err) {
            console.error(`MMM-LuckyHub-FaceSync: Failed to download avatar for @${user.username}: ${err.message}`);
          }
        } else {
          skipCount++;
        }
      }
      
      console.log(`MMM-LuckyHub-FaceSync: Sync completed. Downloaded: ${downloadCount}, Skipped: ${skipCount}.`);
      if (hasChanges && this.pythonProcess) {
        console.log("MMM-LuckyHub-FaceSync: New photos detected, restarting recognition...");
        this.startRecognition();
      }
    } catch (err) {
      console.error("MMM-LuckyHub-FaceSync: Sync error: " + err.message);
    } finally {
      this.isSyncing = false;
    }
  },

  startRecognition: function() {
    // Nếu đang trong quá trình khởi động lại, bỏ qua để tránh lặp
    if (this.isStartingProcess) return;
    this.isStartingProcess = true;

    if (this.pythonProcess) {
      console.log("MMM-LuckyHub-FaceSync: Killing existing Python process...");
      this.pythonProcess.removeAllListeners("close"); // Quan trọng: Gỡ bỏ listener cũ để không bị restart lặp
      this.pythonProcess.kill();
      this.pythonProcess = null;
    }

    const scriptPath = path.resolve(__dirname, "recognize.py");
    if (!fs.existsSync(scriptPath)) {
      console.error("MMM-LuckyHub-FaceSync: recognize.py not found at " + scriptPath);
      this.isStartingProcess = false;
      return;
    }

    console.log("MMM-LuckyHub-FaceSync: Spawning Python process...");
    
    // Thử dùng đường dẫn tuyệt đối để tránh nhầm lẫn phiên bản Python
    const pythonPath = "/usr/bin/python3"; 
    
    // Ép đường dẫn thư viện vào môi trường của tiến trình Python
    const pythonEnv = { 
      ...process.env, 
      PYTHONPATH: [
        "/usr/lib/python3/dist-packages",
        "/home/admin/.local/lib/python3.13/site-packages",
        process.env.PYTHONPATH
      ].filter(Boolean).join(":")
    };

    // Thêm cờ -u để Python không đệm output (unbuffered)
    this.pythonProcess = spawn(pythonPath, ["-u", scriptPath, this.faceDir], { env: pythonEnv });

    this.pythonProcess.on("error", (err) => {
      console.error("MMM-LuckyHub-FaceSync: Failed to start Python process: " + err.message);
    });

    this.pythonProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      console.log("MMM-LuckyHub-FaceSync (Python): " + output);
      if (output === "UNKNOWN") {
        this.sendSocketNotification("USER_LOST");
        this.lastGreetedUser = null;
      } else if (output.startsWith("DETECTED:")) {
        const username = output.replace("DETECTED:", "");
        this.sendSocketNotification("USER_DETECTED", username);
        this.playGreeting(username);
      }
    });

    this.pythonProcess.stderr.on("data", (data) => {
      const errorMsg = data.toString();
      console.error("MMM-LuckyHub-FaceSync (Python Error): " + errorMsg);
    });

    this.pythonProcess.on("close", (code) => {
      console.log("MMM-LuckyHub-FaceSync: Python process exited with code " + code);
      this.pythonProcess = null;
      // Chỉ tự động restart nếu tiến trình bị crash (code != 0 và không phải bị kill - null)
      if (code !== 0 && code !== null) {
        console.log("MMM-LuckyHub-FaceSync: Process crashed, restarting in 5s...");
        setTimeout(() => this.startRecognition(), 5000);
      }
    });

    // Reset cờ sau khi spawn xong
    setTimeout(() => { this.isStartingProcess = false; }, 1000);
  },

  playGreeting: async function(username) {
    if (this.lastGreetedUser === username) return;
    this.lastGreetedUser = username;

    try {
      let fullName = "";
      let prompt = "";
      
      if (username === "UNKNOWN") {
        fullName = "anh chị";
        prompt = "Nói một cách thân thiện và ấm áp: Xin chào anh chị, chúc anh chị một ngày vui vẻ, hãy đăng ký thông tin của anh chị tại Lucky Hub nhé.";
        console.log(`MMM-LuckyHub-FaceSync: [TTS] Đang chuẩn bị lời chào cho người lạ...`);
      } else {
        console.log(`MMM-LuckyHub-FaceSync: [TTS] Đang chuẩn bị lời chào cho ${username}...`);
        const infoUrl = `${this.config.baseUrl}/MM/${username}/info`;
        const infoRes = await axiosInstance.get(infoUrl);
        fullName = infoRes.data.fullName || username;
        prompt = `Nói một cách thân thiện và ấm áp: Xin chào ${fullName}, chúc bạn một ngày vui vẻ.`;
      }

      const audioPath = path.resolve(__dirname, "greeting.wav");
      let audioBuffer = null;

      // Try direct generation first (Bypasses server regional restrictions)
      if (this.serverConfig && this.serverConfig.geminiApiKey) {
        try {
          console.log(`MMM-LuckyHub-FaceSync: [TTS] Attempting direct generation for ${fullName}...`);
          audioBuffer = await ttsHelper.generateTTS(prompt, this.serverConfig.geminiApiKey, this.serverConfig.voiceName);
          console.log(`MMM-LuckyHub-FaceSync: [TTS] Direct generation successful (${audioBuffer.length} bytes)`);
        } catch (ttsErr) {
          console.error(`MMM-LuckyHub-FaceSync: [TTS] Direct generation failed: ${ttsErr.message}. Falling back to server.`);
        }
      }

      // Fallback to server if direct failed or not possible
      if (!audioBuffer) {
        const ttsUrl = `${this.config.baseUrl}/api/tts/greeting/${encodeURIComponent(fullName)}?prompt=${encodeURIComponent(prompt)}`;
        console.log(`MMM-LuckyHub-FaceSync: [TTS] Requesting audio from server: ${ttsUrl}`);
        const response = await axiosInstance.get(ttsUrl, { responseType: 'arraybuffer' });
        
        if (response.status === 200 && response.data.byteLength > 0) {
          audioBuffer = Buffer.from(response.data);
          console.log(`MMM-LuckyHub-FaceSync: [TTS] Server audio received (${audioBuffer.length} bytes)`);
        } else {
          console.warn(`MMM-LuckyHub-FaceSync: [TTS] Server returned status ${response.status} or empty data.`);
        }
      }

      if (audioBuffer) {
        await fs.writeFile(audioPath, audioBuffer);
        
        // Phát âm thanh qua HDMI
        const playCmd = `aplay -D plughw:1,0 -r 24000 -f S16_LE -c 1 ${audioPath}`;
        console.log(`MMM-LuckyHub-FaceSync: [AUDIO] Executing play command: ${playCmd}`);
        
        const { exec } = require("child_process");
        exec(playCmd, (error) => {
          if (error) console.error(`MMM-LuckyHub-FaceSync: [AUDIO] Error playing sound: ${error.message}`);
          else console.log(`MMM-LuckyHub-FaceSync: [AUDIO] Playback finished`);
        });
      } else {
        console.error("MMM-LuckyHub-FaceSync: [TTS] No audio data to play.");
      }
    } catch (err) {
      console.error("MMM-LuckyHub-FaceSync: [ERROR] Lỗi xử lý lời chào: " + err.message);
    }
  },

  stop: function() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
    }
  }
});
