
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

/**
 * PHÂN TÍCH: TypeScript báo lỗi do thuộc tính 'debugLog' và 'reactLoaded' không tồn tại 
 * trong định nghĩa mặc định của interface Window.
 * CÁCH GIẢI QUYẾT: Sử dụng 'declare global' để mở rộng interface Window với các thuộc tính tùy chỉnh.
 */
declare global {
  interface Window {
    debugLog?: (message: string, type?: string) => void;
    reactLoaded?: boolean;
  }
}

// Ghi log để debug khởi tạo - kiểm tra sự tồn tại của debugLog trên window
if (window.debugLog) window.debugLog("Khởi tạo index.tsx thành công", "system");

const rootElement = document.getElementById('root');
if (!rootElement) {
  if (window.debugLog) window.debugLog("LỖI: Không tìm thấy thẻ #root", "error");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  // BÁO CÁO KẾT QUẢ: Thiết lập trạng thái tải thành công của React và ghi log
  window.reactLoaded = true;
  if (window.debugLog) window.debugLog("React đã Render thành công!", "system");
} catch (err) {
  // Xử lý lỗi render bằng cách trích xuất message an toàn từ catch block
  const errorMessage = err instanceof Error ? err.message : String(err);
  if (window.debugLog) window.debugLog("LỖI RENDER: " + errorMessage, "error");
}
