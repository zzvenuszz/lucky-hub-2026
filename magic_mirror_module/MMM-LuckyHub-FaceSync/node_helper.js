
const NodeHelper = require("node_helper");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");

module.exports = NodeHelper.create({
  start: function() {
    this.config = null;
    this.users = [];
    this.faceDir = path.resolve(__dirname, "faces");
    this.isSyncing = false;
    this.pythonProcess = null;
    
    // Đảm bảo thư mục chứa ảnh tồn tại
    fs.ensureDirSync(this.faceDir);
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "CONFIG") {
      this.config = payload;
      this.startSyncLoop();
      this.startRecognition();
    }
  },

  startSyncLoop: function() {
    const self = this;
    const sync = async () => {
      if (this.isSyncing) return;
      this.isSyncing = true;
      this.sendSocketNotification("LOG", "Đang đồng bộ danh sách hội viên...");
      
      try {
        const response = await axios.get(this.config.baseUrl + "/MM/users/sync");
        const remoteUsers = response.data;
        
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
            this.sendSocketNotification("LOG", `Đang tải avatar mới cho @${user.username}...`);
            const imgRes = await axios.get(user.avatar, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, imgRes.data);
            await fs.writeJson(metaPath, { username: user.username, updatedAt: user.updatedAt });
            hasChanges = true;
          }
        }
        
        this.users = remoteUsers;
        this.sendSocketNotification("LOG", "Đồng bộ hoàn tất.");
        
        // Nếu có thay đổi ảnh, khởi động lại tiến trình nhận diện để load lại ảnh
        if (hasChanges && this.pythonProcess) {
          this.sendSocketNotification("LOG", "Phát hiện ảnh mới, đang khởi động lại nhận diện...");
          this.startRecognition();
        }
      } catch (err) {
        this.sendSocketNotification("LOG", "Lỗi đồng bộ: " + err.message);
      } finally {
        this.isSyncing = false;
      }
    };

    sync();
    setInterval(sync, this.config.syncInterval);
  },

  startRecognition: function() {
    const self = this;
    
    // Dừng tiến trình cũ nếu đang chạy
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
    }

    const scriptPath = path.resolve(__dirname, "recognize.py");
    
    // Kiểm tra xem file python có tồn tại không
    if (!fs.existsSync(scriptPath)) {
      this.sendSocketNotification("LOG", "Lỗi: Không tìm thấy file recognize.py");
      return;
    }

    this.sendSocketNotification("LOG", "Đang khởi động tiến trình nhận diện khuôn mặt...");
    
    // Khởi chạy script Python
    this.pythonProcess = spawn("python3", [scriptPath, this.faceDir]);

    this.pythonProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output === "UNKNOWN") {
        this.sendSocketNotification("USER_LOST");
      } else if (output.startsWith("DETECTED:")) {
        const username = output.replace("DETECTED:", "");
        this.sendSocketNotification("USER_DETECTED", username);
      } else {
        this.sendSocketNotification("LOG", "Python: " + output);
      }
    });

    this.pythonProcess.stderr.on("data", (data) => {
      this.sendSocketNotification("LOG", "Python Error: " + data.toString());
    });

    this.pythonProcess.on("close", (code) => {
      this.sendSocketNotification("LOG", "Tiến trình nhận diện đã dừng với mã: " + code);
      // Tự động khởi động lại sau 5 giây nếu bị crash
      if (code !== 0) {
        setTimeout(() => this.startRecognition(), 5000);
      }
    });
  },

  stop: function() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
    }
  }
});
