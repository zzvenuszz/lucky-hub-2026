
const NodeHelper = require("node_helper");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const https = require("https");

// Bỏ qua kiểm tra SSL nếu Raspberry Pi gặp lỗi chứng chỉ
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

module.exports = NodeHelper.create({
  start: function() {
    console.log("MMM-LuckyHub-FaceSync: Helper started.");
    this.config = null;
    this.faceDir = path.resolve(__dirname, "faces");
    this.isSyncing = false;
    this.pythonProcess = null;
    fs.ensureDirSync(this.faceDir);
  },

  socketNotificationReceived: function(notification, payload) {
    console.log("MMM-LuckyHub-FaceSync: Received socket notification: " + notification);
    if (notification === "CONFIG") {
      this.config = payload;
      console.log("MMM-LuckyHub-FaceSync: Config received. BaseURL: " + this.config.baseUrl);
      this.startSyncLoop();
      this.startRecognition();
    }
  },

  startSyncLoop: function() {
    const self = this;
    const sync = async () => {
      if (this.isSyncing) return;
      this.isSyncing = true;
      console.log("MMM-LuckyHub-FaceSync: Starting sync...");
      
      try {
        const url = this.config.baseUrl + "/MM/users/sync";
        console.log("MMM-LuckyHub-FaceSync: Fetching users from " + url);
        const response = await axiosInstance.get(url);
        const remoteUsers = response.data;
        console.log(`MMM-LuckyHub-FaceSync: Found ${remoteUsers.length} users on server.`);
        
        let hasChanges = false;
        for (const user of remoteUsers) {
          if (!user.avatar) continue;
          
          const fileName = `${user.username}.jpg`;
          const filePath = path.join(this.faceDir, fileName);
          const metaPath = path.join(this.faceDir, `${user.username}.json`);
          
          let shouldDownload = true;
          if (fs.existsSync(filePath) && fs.existsSync(metaPath)) {
            const localMeta = fs.readJsonSync(metaPath);
            if (localMeta.updatedAt === user.updatedAt) {
              shouldDownload = false;
            }
          }
          
          if (shouldDownload) {
            console.log(`MMM-LuckyHub-FaceSync: Downloading avatar for @${user.username}...`);
            const imgRes = await axiosInstance.get(user.avatar, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, imgRes.data);
            await fs.writeJson(metaPath, { username: user.username, updatedAt: user.updatedAt });
            hasChanges = true;
          }
        }
        
        console.log("MMM-LuckyHub-FaceSync: Sync completed.");
        if (hasChanges && this.pythonProcess) {
          console.log("MMM-LuckyHub-FaceSync: New photos detected, restarting recognition...");
          this.startRecognition();
        }
      } catch (err) {
        console.error("MMM-LuckyHub-FaceSync: Sync error: " + err.message);
      } finally {
        this.isSyncing = false;
      }
    };

    sync();
    setInterval(sync, this.config.syncInterval);
  },

  startRecognition: function() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
    }

    const scriptPath = path.resolve(__dirname, "recognize.py");
    if (!fs.existsSync(scriptPath)) {
      console.error("MMM-LuckyHub-FaceSync: recognize.py not found at " + scriptPath);
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
      if (code !== 0) {
        setTimeout(() => this.startRecognition(), 5000);
      }
    });
  },

  playGreeting: async function(username) {
    // Tránh chào lặp lại liên tục trong cùng một phiên
    if (this.lastGreetedUser === username) return;
    this.lastGreetedUser = username;

    try {
      let fullName = "";
      
      if (username === "UNKNOWN") {
        fullName = "anh chị";
        console.log(`MMM-LuckyHub-FaceSync: [TTS] Đang chuẩn bị lời chào cho người lạ...`);
      } else {
        console.log(`MMM-LuckyHub-FaceSync: [TTS] Đang chuẩn bị lời chào cho ${username}...`);
        // Lấy thông tin đầy đủ để chào bằng tên thật
        const infoUrl = `${this.config.baseUrl}/MM/${username}/info`;
        console.log(`MMM-LuckyHub-FaceSync: [API] Requesting user info from: ${infoUrl}`);
        const infoRes = await axiosInstance.get(infoUrl);
        fullName = infoRes.data.fullName || username;
        console.log(`MMM-LuckyHub-FaceSync: [API] User info received: ${fullName}`);
      }

      // Tải file âm thanh từ server
      // Nếu là người lạ, dùng prompt đặc biệt
      let prompt = `Nói một cách thân thiện và ấm áp: Xin chào ${fullName}, chúc bạn một ngày vui vẻ.`;
      if (username === "UNKNOWN") {
        prompt = "Nói một cách thân thiện và ấm áp: Xin chào anh chị, chúc anh chị một ngày vui vẻ, hãy đăng ký thông tin của anh chị tại Lucky Hub nhé.";
      }

      const ttsUrl = `${this.config.baseUrl}/api/tts/greeting/${encodeURIComponent(fullName)}?prompt=${encodeURIComponent(prompt)}`;
      const audioPath = path.resolve(__dirname, "greeting.wav");
      
      console.log(`MMM-LuckyHub-FaceSync: [TTS] Requesting audio from: ${ttsUrl}`);
      const response = await axiosInstance.get(ttsUrl, { responseType: 'arraybuffer' });
      console.log(`MMM-LuckyHub-FaceSync: [TTS] Audio received (${response.data.byteLength} bytes)`);
      
      await fs.writeFile(audioPath, response.data);
      console.log(`MMM-LuckyHub-FaceSync: [TTS] Audio saved to: ${audioPath}`);

      // Phát âm thanh qua HDMI (plughw:1,0)
      // Ép định dạng 24kHz, 16-bit, Mono để khớp với chuẩn Gemini TTS
      const playCmd = `aplay -D plughw:1,0 -r 24000 -f S16_LE -c 1 ${audioPath}`;
      console.log(`MMM-LuckyHub-FaceSync: [AUDIO] Executing play command: ${playCmd}`);
      
      const { exec } = require("child_process");
      exec(playCmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`MMM-LuckyHub-FaceSync: [AUDIO] Error playing sound: ${error.message}`);
          return;
        }
        console.log(`MMM-LuckyHub-FaceSync: [AUDIO] Playback finished successfully`);
      });
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
