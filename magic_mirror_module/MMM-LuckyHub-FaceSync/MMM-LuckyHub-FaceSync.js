
Module.register("MMM-LuckyHub-FaceSync", {
  defaults: {
    baseUrl: "https://ais-dev-rk6e4t6ryqfyczqrnteuxj-275449668179.asia-east1.run.app",
    syncInterval: 30 * 60 * 1000, // 30 phút đồng bộ 1 lần
    recognitionInterval: 2000, // 2 giây quét 1 lần
    confidenceThreshold: 0.6,
  },

  start: function() {
    Log.info("MMM-LuckyHub-FaceSync: Starting module: " + this.name);
    console.log("MMM-LuckyHub-FaceSync: Sending CONFIG to node_helper...");
    this.sendSocketNotification("CONFIG", this.config);
    this.lastDetectedUser = null;
  },

  getDom: function() {
    const wrapper = document.createElement("div");
    wrapper.style.display = "none"; // Module này chạy ngầm
    return wrapper;
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "USER_DETECTED") {
      if (this.lastDetectedUser !== payload) {
        this.lastDetectedUser = payload;
        Log.info("LuckyHub FaceSync: Detected " + payload);
        // Gửi notification cho module hiển thị (MMM-LuckyHub)
        this.sendNotification("USER_DETECTED", payload);
      }
    } else if (notification === "USER_LOST") {
      if (this.lastDetectedUser !== null) {
        this.lastDetectedUser = null;
        this.sendNotification("USER_LOST");
      }
    } else if (notification === "LOG") {
      Log.info("LuckyHub FaceSync Helper: " + payload);
    }
  },
});
