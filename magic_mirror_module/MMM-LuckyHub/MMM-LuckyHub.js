
Module.register("MMM-LuckyHub", {
  // Default module config.
  defaults: {
    baseUrl: "https://ais-dev-rk6e4t6ryqfyczqrnteuxj-275449668179.asia-east1.run.app", // Thay bằng URL của bạn
    username: null, // Sẽ được cập nhật qua notification hoặc config
    updateInterval: 10 * 60 * 1000, // 10 phút
    retryDelay: 5000,
    animationSpeed: 1000,
  },

  start: function() {
    Log.info("Starting module: " + this.name);
    this.userInfo = null;
    this.metrics = [];
    this.loaded = false;
    this.error = null;

    if (this.config.username) {
      this.getData();
    }
  },

  // Define required scripts.
  getStyles: function() {
    return ["MMM-LuckyHub.css"];
  },

  // Override dom generator.
  getDom: function() {
    const wrapper = document.createElement("div");
    wrapper.className = "lucky-hub-wrapper";

    if (!this.config.username) {
      wrapper.innerHTML = "Đang chờ nhận diện khuôn mặt...";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (this.error) {
      wrapper.innerHTML = "Lỗi: " + this.error;
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (!this.loaded) {
      wrapper.innerHTML = "Đang tải dữ liệu Lucky Hub...";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    // Render User Info
    const header = document.createElement("div");
    header.className = "module-header";
    header.innerHTML = "🍀 Lucky Hub: " + (this.userInfo ? this.userInfo.fullName : this.config.username);
    wrapper.appendChild(header);

    if (this.userInfo && this.userInfo.avatar) {
      const avatar = document.createElement("img");
      avatar.src = this.userInfo.avatar;
      avatar.className = "user-avatar";
      wrapper.appendChild(avatar);
    }

    // Render Latest Metrics
    if (this.metrics && this.metrics.length > 0) {
      const latest = this.metrics[0];
      const statsGrid = document.createElement("div");
      statsGrid.className = "stats-grid";

      const createStat = (label, value, unit) => {
        const div = document.createElement("div");
        div.className = "stat-item";
        div.innerHTML = `<span class="stat-label">${label}:</span> <span class="stat-value">${value}${unit}</span>`;
        return div;
      };

      statsGrid.appendChild(createStat("Cân nặng", latest.weight, "kg"));
      statsGrid.appendChild(createStat("Tỉ lệ mỡ", latest.bodyFat, "%"));
      statsGrid.appendChild(createStat("Cơ bắp", latest.muscleMass, "kg"));
      statsGrid.appendChild(createStat("Mỡ nội tạng", latest.visceralFat, ""));
      statsGrid.appendChild(createStat("Tuổi sinh học", latest.bioAge, " tuổi"));

      wrapper.appendChild(statsGrid);

      const dateDiv = document.createElement("div");
      dateDiv.className = "dimmed xsmall";
      dateDiv.style.marginTop = "10px";
      dateDiv.innerHTML = "Cập nhật lúc: " + latest.date;
      wrapper.appendChild(dateDiv);
    } else {
      const noData = document.createElement("div");
      noData.className = "dimmed small";
      noData.innerHTML = "Chưa có dữ liệu chỉ số.";
      wrapper.appendChild(noData);
    }

    return wrapper;
  },

  getData: function() {
    const self = this;
    const infoUrl = this.config.baseUrl + "/MM/" + this.config.username + "/info";
    const metricsUrl = this.config.baseUrl + "/MM/" + this.config.username + "/metrics/1";

    Promise.all([
      fetch(infoUrl).then(res => res.json()),
      fetch(metricsUrl).then(res => res.json())
    ])
    .then(([info, metrics]) => {
      self.userInfo = info;
      self.metrics = metrics;
      self.loaded = true;
      self.error = null;
      self.updateDom(self.config.animationSpeed);
    })
    .catch(err => {
      Log.error("LuckyHub Error: " + err);
      self.error = "Không thể kết nối API";
      self.updateDom(self.config.animationSpeed);
    });
  },

  notificationReceived: function(notification, payload, sender) {
    // Lắng nghe notification từ module nhận diện khuôn mặt
    // Ví dụ: MMM-Face-Reco-DNN gửi notification 'USER_FOUND' với payload là username
    if (notification === "USER_DETECTED" || notification === "CURRENT_USER") {
      if (this.config.username !== payload) {
        this.config.username = payload;
        this.loaded = false;
        this.getData();
      }
    } else if (notification === "USER_LOST") {
      this.config.username = null;
      this.userInfo = null;
      this.metrics = [];
      this.updateDom(this.config.animationSpeed);
    }
  },
});
