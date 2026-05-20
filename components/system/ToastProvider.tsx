import React, { createContext, useContext, useState, useCallback, useRef, useEffect, memo } from 'react';

// Types
export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number; // ms, mặc định 3000
}

interface ToastContextType {
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
  isMuted: boolean;
  setMuted: (muted: boolean) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const LS_MUTE_KEY = 'lucky_hub_mute_popup';

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

// ===== Toast Item Component =====
const ICONS: Record<string, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️',
};

const COLORS: Record<string, { bg: string; border: string; text: string }> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  error: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
};

interface ToastItemProps {
  toast: ToastItem;
  onRemove: (id: string) => void;
}

const ToastItemComponent: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isHovering, setIsHovering] = useState(false);
  const timerRef = useRef<number | null>(null);
  const colors = COLORS[toast.type] || COLORS.info;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    const duration = toast.duration || 3000;
    timerRef.current = window.setTimeout(() => {
      onRemove(toast.id);
    }, duration);
  }, [toast.id, toast.duration, onRemove, clearTimer]);

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [startTimer, clearTimer]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    clearTimer();
  }, [clearTimer]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    startTimer();
  }, [startTimer]);

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-2xl shadow-2xl border ${colors.bg} ${colors.border} animate-in slide-in-from-right zoom-in-95 duration-300 max-w-sm`}
      style={{ animationDuration: '300ms' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="text-xl shrink-0 mt-0.5">{ICONS[toast.type] || '📌'}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-black uppercase tracking-wider ${colors.text}`}>{toast.title}</p>
        {toast.message && (
          <p className="text-[11px] font-medium text-slate-600 mt-0.5 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className={`text-xs opacity-50 hover:opacity-100 ${colors.text} shrink-0`}
      >
        ✕
      </button>
    </div>
  );
};

// ===== Provider =====
const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_MUTE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>): string => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastItem = { ...toast, id };
    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    setIsMuted(muted);
    try {
      localStorage.setItem(LS_MUTE_KEY, muted ? 'true' : 'false');
    } catch {}
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, isMuted, setMuted }}>
      {children}

      {/* Toast Container - fixed top-right */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItemComponent toast={toast} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

ToastProvider.displayName = 'ToastProvider';

export default ToastProvider;