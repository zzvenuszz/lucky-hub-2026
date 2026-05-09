
Module.register("MMM-LuckyHub", {
  // Default module config.
  defaults: {
    baseUrl: "https://lucky-hub-2026.onrender.com", // Thay bằng URL của bạn
    username: null, // Sẽ được cập nhật qua notification hoặc config
    updateInterval: 10 * 60 * 1000, // 10 phút
    retryDelay: 5000,
    animationSpeed: 1000,
    metricsLimit: 7, // Hiển thị 7 ngày gần nhất
  },

  start: function() {
    Log.info("Starting module: " + this.name);
    this.userInfo = null;
    this.metrics = [];
    this.loaded = false;
    this.error = null;
    this.chart = null;

    if (this.config.username) {
      this.getData();
    }
  },

  // Define required scripts.
  getScripts: function() {
    return ["https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.9.4/Chart.min.js"];
  },

  getStyles: function() {
    return ["MMM-LuckyHub.css"];
  },

  getDom: function() {
    const self = this;
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
      welcome.style.color = "#FFFFFF";
      welcome.style.fontWeight = "bold";
      welcome.innerHTML = "Chào mừng bạn đến với Lucky Hub!<br><br>Hãy đăng ký thông tin của bạn để theo dõi sức khỏe nhé.";
      container.appendChild(welcome);
      wrapper.appendChild(container);
      return wrapper;
    }

    // Avatar Section (Centered - Stable)
    if (this.userInfo && this.userInfo.avatar) {
      const avatarContainer = document.createElement("div");
      avatarContainer.className = "lucky-avatar-container";
      
      const avatar = document.createElement("img");
      avatar.src = this.userInfo.avatar;
      avatar.className = "lucky-avatar";
      
      // Force dimensions via inline style to prevent full-screen issues
      avatar.style.width = "120px";
      avatar.style.height = "120px";
      avatar.style.borderRadius = "50%";
      avatar.style.objectFit = "cover";
      avatar.style.border = "4px solid #FFFFFF";
      avatar.style.display = "block";
      avatar.style.margin = "0 auto";
      
      avatar.onerror = () => { avatar.style.display = 'none'; };
      
      avatarContainer.appendChild(avatar);
      container.appendChild(avatarContainer);
    }

    // Metrics Summary (Vertical list like original)
    if (this.metrics && this.metrics.length > 0) {
      const latest = this.metrics[0];
      const metricsWrapper = document.createElement("div");
      metricsWrapper.className = "lucky-metrics";
      
      const stats = [
        { label: "Cân nặng", value: latest.weight, unit: "kg" },
        { label: "Tỉ lệ mỡ", value: latest.bodyFat, unit: "%" },
        { label: "Cơ bắp", value: latest.muscleMass, unit: "kg" }
      ];

      stats.forEach(s => {
        const item = document.createElement("div");
        item.className = "lucky-metric-item";
        item.innerHTML = `<span class="label">${s.label}:</span> <span class="value">${s.value}${s.unit}</span>`;
        metricsWrapper.appendChild(item);
      });

      container.appendChild(metricsWrapper);
    }

    // Pie Chart Section
    if (this.metrics && this.metrics.length > 0) {
      const chartSection = document.createElement("div");
      chartSection.className = "lucky-chart-section";
      chartSection.innerHTML = "<div class='section-title'>Cấu trúc cơ thể</div>";
      
      const chartWrapper = document.createElement("div");
      chartWrapper.className = "lucky-chart-wrapper";
      chartWrapper.style.height = "180px";
      chartWrapper.style.width = "100%";
      chartWrapper.style.position = "relative";

      const canvas = document.createElement("canvas");
      canvas.id = "lucky-pie-chart-" + this.identifier;
      chartWrapper.appendChild(canvas);
      chartSection.appendChild(chartWrapper);
      container.appendChild(chartSection);

      // Initialize chart after DOM is ready
      setTimeout(() => {
        self.renderPieChart(canvas.id, self.metrics[0]);
      }, 1000); 
    }

    // History Table Section
    if (this.metrics && this.metrics.length > 0) {
      const tableSection = document.createElement("div");
      tableSection.className = "lucky-table-section";
      tableSection.innerHTML = "<div class='section-title'>Lịch sử 7 ngày</div>";

      const table = document.createElement("table");
      table.className = "lucky-table";
      
      const getTrend = (current, previous, isPositiveGood = false) => {
        if (previous === undefined || previous === null) return "";
        const diff = Number((current - previous).toFixed(1));
        if (diff === 0) return "";
        
        const isGood = isPositiveGood ? diff > 0 : diff < 0;
        const colorClass = isGood ? "trend-up" : "trend-down";
        const icon = diff > 0 ? "↑" : "↓";
        return `<span class="trend ${colorClass}">${icon}${Math.abs(diff)}</span>`;
      };

      table.innerHTML = `
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Cân</th>
            <th>Mỡ</th>
            <th>Cơ</th>
            <th>Nước</th>
          </tr>
        </thead>
        <tbody>
          ${this.metrics.map((m, i) => {
            const prev = this.metrics[i + 1];
            return `
              <tr>
                <td>${m.date.split('-').slice(1).reverse().join('/')}</td>
                <td>${m.weight} ${getTrend(m.weight, prev?.weight, false)}</td>
                <td>${m.bodyFat}% ${getTrend(m.bodyFat, prev?.bodyFat, false)}</td>
                <td>${m.muscleMass} ${getTrend(m.muscleMass, prev?.muscleMass, true)}</td>
                <td>${m.waterPercent}% ${getTrend(m.waterPercent, prev?.waterPercent, true)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      `;
      tableSection.appendChild(table);
      container.appendChild(tableSection);
    }

    wrapper.appendChild(container);
    return wrapper;
  },

  renderPieChart: function(canvasId, latest) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      Log.error("MMM-LuckyHub: Canvas element not found: " + canvasId);
      return;
    }

    if (typeof Chart === "undefined") {
      Log.error("MMM-LuckyHub: Chart.js is not loaded!");
      return;
    }

    if (this.chart) {
      this.chart.destroy();
    }

    const weight = latest.weight || 0;
    const fatMass = Number((weight * ((latest.bodyFat || 0) / 100)).toFixed(1));
    const waterMass = Number((weight * ((latest.waterPercent || 0) / 100)).toFixed(1));
    const minerals = latest.boneMinerals || 0;
    const muscle = latest.muscleMass || 0;

    const ctx = canvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Cơ bắp', 'Nước', 'Mỡ', 'Khoáng'],
        datasets: [{
          data: [muscle, waterMass, fatMass, minerals],
          backgroundColor: ['#FFFFFF', '#EEEEEE', '#CCCCCC', '#AAAAAA'],
          borderColor: '#000000',
          borderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutoutPercentage: 70,
        legend: {
          position: 'bottom',
          labels: {
            fontColor: '#FFFFFF',
            fontSize: 12,
            fontStyle: 'bold',
            padding: 15,
            usePointStyle: true
          }
        },
        tooltips: {
          enabled: true,
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFontColor: '#FFFFFF',
          bodyFontColor: '#FFFFFF',
          borderColor: '#FFFFFF',
          borderWidth: 1,
          callbacks: {
            label: function(tooltipItem, data) {
              const label = data.labels[tooltipItem.index];
              const value = data.datasets[0].data[tooltipItem.index];
              return label + ': ' + value + ' kg';
            }
          }
        }
      }
    });
  },

  getData: function() {
    const self = this;
    const infoUrl = this.config.baseUrl + "/MM/" + this.config.username + "/info";
    const metricsUrl = this.config.baseUrl + "/MM/" + this.config.username + "/metrics/" + this.config.metricsLimit;

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
