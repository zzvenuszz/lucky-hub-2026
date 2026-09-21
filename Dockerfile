FROM node:20-alpine

WORKDIR /app

# Sao chép file định hình thư viện
COPY package*.json ./
RUN npm install

# Sao chép toàn bộ mã nguồn (bao gồm cả thư mục favicon và img sang Docker)
COPY . .

# Tự động build dự án nếu cần thiết
RUN npm run build || true

# Ép ứng dụng chạy trên cổng 3000
ENV PORT=3000
EXPOSE 3000

# Khởi chạy ứng dụng backend/fullstack của bạn
CMD ["node", "run.js"]