FROM node:20-alpine

WORKDIR /app

# Sao chép file định hình thư viện
COPY package*.json ./
RUN npm install

# Sao chép toàn bộ mã nguồn (bao gồm cả thư mục favicon và img sang Docker)
COPY . .

# Tự động build dự án nếu cần thiết
RUN npm run build || true

# Ép ứng dụng chạy trên cổng 7860 theo quy định bắt buộc của Hugging Face
ENV PORT=7860
EXPOSE 7860

# Khởi chạy ứng dụng backend/fullstack của bạn
CMD ["node", "run.js"]