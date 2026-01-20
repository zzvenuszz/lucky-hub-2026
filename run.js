
/**
 * File này được Render.com sử dụng để khởi chạy ứng dụng.
 * Tối ưu hóa việc gọi tsx để tránh các lỗi shell và cảnh báo bảo mật.
 */
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Đang khởi động Lucky Hub Server (Production Mode)...');

// Sử dụng lệnh npx để gọi trực tiếp tsx mà không cần shell: true
// Điều này giúp tránh cảnh báo DEP0190 và cải thiện hiệu năng
const child = spawn('npx', ['tsx', 'server.ts'], {
  stdio: 'inherit',
  // Bỏ shell: true để giải quyết DeprecationWarning
});

child.on('error', (err) => {
  console.error('❌ Không thể khởi động server:', err);
});

child.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.log(`⚠️ Server đã dừng bất thường với mã thoát: ${code}`);
  } else {
    console.log(`ℹ️ Server đã đóng.`);
  }
  process.exit(code || 0);
});
