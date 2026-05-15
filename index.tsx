
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

declare global {
  interface Window {
    debugLog?: (message: string, type?: string, duration?: number) => void;
    reactLoaded?: boolean;
  }
  
  // TypeScript type for Credential Management API PasswordCredential
  interface PasswordCredential extends Credential {
    readonly id: string;
    readonly password: string;
    readonly name: string;
  }
  
  interface PasswordCredentialConstructor {
    new (data: { id: string; password: string; name: string }): PasswordCredential;
  }
  
  interface Window {
    PasswordCredential?: PasswordCredentialConstructor;
  }
}

// Thiết lập Bridge để các file .ts/JS thuần có thể gửi log vào hệ thống React
window.debugLog = (message: string, type: string = 'info', duration?: number) => {
  const event = new CustomEvent('app-system-log', {
    detail: { 
      message, 
      type, 
      duration, 
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).substring(7)
    }
  });
  window.dispatchEvent(event);
};

if (window.debugLog) window.debugLog("Hệ thống Lucky Hub đang khởi động...", "system");

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  window.reactLoaded = true;
  if (window.debugLog) window.debugLog("React Render thành công!", "system");
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  if (window.debugLog) window.debugLog("LỖI KHỞI CHẠY: " + errorMessage, "error");
}
