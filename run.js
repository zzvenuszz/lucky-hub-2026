
/**
 * File khởi chạy chính cho Render.com
 * Sử dụng tsx để thực thi server.ts trực tiếp
 */
const { spawn } = require('child_process');

console.log('🚀 Đang khởi chạy hệ thống Lucky Hub...');

// Khởi chạy tsx thông qua npx để đảm bảo môi trường sạch
const server = spawn('npx', ['tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: process.env
});

server.on('error', (err) => {
  console.error('❌ Lỗi khởi động:', err.message);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`⚠️ Hệ thống dừng với mã lỗi: ${code}`);
  }
  process.exit(code || 0);
});
