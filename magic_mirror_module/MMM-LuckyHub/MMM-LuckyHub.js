
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

  getDom: function() {
    const wrapper = document.createElement("div");
    wrapper.classList.add("lucky-hub-root");

    if (!this.config.username) {
      wrapper.innerHTML = "<div class='lucky-status dimmed'>Đang chờ nhận diện khuôn mặt...</div>";
      return wrapper;
    }

    if (this.error) {
      wrapper.innerHTML = `<div class='lucky-error'>Lỗi: ${this.error}</div>`;
      return wrapper;
    }

    if (!this.loaded) {
      wrapper.innerHTML = "<div class='lucky-status animate-pulse'>Đang tải dữ liệu Lucky Hub...</div>";
      return wrapper;
    }

    // Main Container
    const container = document.createElement("div");
    container.classList.add("lucky-container");

    // Header
    const header = document.createElement("div");
    header.className = "lucky-header";
    header.innerHTML = `🍀 Lucky Hub: ${this.userInfo ? this.userInfo.fullName : this.config.username}`;
    container.appendChild(header);

    if (this.config.username === "UNKNOWN") {
      const welcome = document.createElement("div");
      welcome.className = "lucky-welcome animate-pulse";
      welcome.style.textAlign = "center";
      welcome.style.padding = "20px";
      welcome.style.fontSize = "18px";
      welcome.style.color = "#10b981";
      welcome.style.fontWeight = "bold";
      welcome.innerHTML = "Chào mừng bạn đến với Lucky Hub!<br><br>Hãy đăng ký thông tin của bạn để theo dõi sức khỏe nhé.";
      container.appendChild(welcome);
      wrapper.appendChild(container);
      return wrapper;
    }

    // Avatar
    if (this.userInfo && this.userInfo.avatar) {
      const avatarContainer = document.createElement("div");
      avatarContainer.className = "lucky-avatar-container";
      avatarContainer.style.margin = "10px auto";
      avatarContainer.style.width = "120px";
      avatarContainer.style.height = "120px";
      
      const avatar = document.createElement("img");
      avatar.src = this.userInfo.avatar;
      avatar.className = "lucky-avatar";
      
      // Ép kích thước cố định bằng inline style
      avatar.style.width = "120px";
      avatar.style.height = "120px";
      avatar.style.borderRadius = "50%";
      avatar.style.objectFit = "cover";
      avatar.style.border = "3px solid #10b981";
      avatar.style.display = "block";
      
      avatar.onerror = () => { avatar.style.display = 'none'; };
      
      avatarContainer.appendChild(avatar);
      container.appendChild(avatarContainer);
    }

    // Metrics
    const metricsWrapper = document.createElement("div");
    metricsWrapper.className = "lucky-metrics";

    if (this.metrics && this.metrics.length > 0) {
      const latest = this.metrics[0];
      
      const stats = [
        { label: "Cân nặng", value: latest.weight, unit: "kg" },
        { label: "Tỉ lệ mỡ", value: latest.bodyFat, unit: "%" },
        { label: "Cơ bắp", value: latest.muscleMass, unit: "kg" },
        { label: "Mỡ nội tạng", value: latest.visceralFat, unit: "" },
        { label: "Tuổi sinh học", value: latest.bioAge, unit: " tuổi" }
      ];

      stats.forEach(s => {
        const item = document.createElement("div");
        item.className = "lucky-metric-item";
        item.innerHTML = `<span class="label">${s.label}:</span> <span class="value">${s.value}${s.unit}</span>`;
        metricsWrapper.appendChild(item);
      });

      container.appendChild(metricsWrapper);

      const footer = document.createElement("div");
      footer.className = "lucky-footer dimmed xsmall";
      footer.innerHTML = "Cập nhật: " + latest.date;
      container.appendChild(footer);
    } else {
      metricsWrapper.innerHTML = "<div class='dimmed small'>Chưa có dữ liệu chỉ số.</div>";
      container.appendChild(metricsWrapper);
    }

    wrapper.appendChild(container);
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
    Log.info(`MMM-LuckyHub: Received ${notification} from ${sender ? sender.name : 'system'}`);
    
    if (notification === "USER_DETECTED" || notification === "CURRENT_USER") {
      if (this.config.username !== payload) {
        Log.info(`MMM-LuckyHub: Switching to user ${payload}`);
        this.config.username = payload;
        
        if (payload === "UNKNOWN") {
          this.userInfo = { fullName: "Anh Chị" };
          this.metrics = [];
          this.loaded = true;
          this.error = null;
          this.updateDom(this.config.animationSpeed);
        } else {
          this.loaded = false;
          this.getData();
        }
      }
    } else if (notification === "USER_LOST") {
      Log.info("MMM-LuckyHub: User lost, resetting UI");
      this.config.username = null;
      this.userInfo = null;
      this.metrics = [];
      this.loaded = false;
      this.updateDom(this.config.animationSpeed);
    }
  },
});
