
/**
 * File này được Render.com sử dụng để khởi chạy ứng dụng.
 * Nó sử dụng 'tsx' để chạy trực tiếp TypeScript trên môi trường Node.js.
 */
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Đang khởi động Lucky Hub Server...');

const child = spawn('npx', ['tsx', 'server.ts'], {
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => {
  console.log(`Server đã dừng với mã thoát: ${code}`);
  process.exit(code);
});
