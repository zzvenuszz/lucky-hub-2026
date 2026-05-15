
import React, { useState, useEffect, useRef, memo } from 'react';

interface LoginProps {
  onLogin: (data: any) => void;
  onSwitchRegister: () => void;
  onForgotPassword: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
  lockUntil?: string | null;
}

const Login: React.FC<LoginProps> = ({ onLogin, onSwitchRegister, onForgotPassword, isLoading, errorMessage, lockUntil }) => {
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [countdown, setCountdown] = useState<string>('');
  const intervalRef = useRef<number | null>(null);

  // Countdown timer cho lockout
  useEffect(() => {
    // Clear interval cũ nếu có
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!lockUntil) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const lockTime = new Date(lockUntil).getTime();
      const remaining = Math.max(0, lockTime - now);

      if (remaining <= 0) {
        setCountdown('');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    intervalRef.current = window.setInterval(updateCountdown, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [lockUntil]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin({ ...loginData, rememberMe });
  };

  const isLocked = countdown !== '';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in zoom-in-95">
      {errorMessage && (
        <div className={`rounded-2xl px-4 py-3 text-xs font-black text-center leading-relaxed shadow-inner ${isLocked ? 'bg-orange-50 border border-orange-200 text-orange-600' : 'bg-rose-50 border border-rose-200 text-rose-600'}`}>
          {isLocked ? (
            <>
              <div>🔒 Tài khoản đã bị tạm khóa</div>
              <div className="mt-1 text-base tracking-widest font-mono">{countdown}</div>
              <div className="mt-0.5 text-[10px] opacity-70">Vui lòng đợi để thử lại</div>
              <button
                type="button"
                onClick={onForgotPassword}
                className="mt-2 w-full py-2 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-wider text-[10px] shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
              >
                🔓 Mở khóa ngay bằng cách đặt lại mật khẩu
              </button>
            </>
          ) : (
            errorMessage
          )}
        </div>
      )}
      <input 
        required 
        placeholder="Email hoặc Tên đăng nhập" 
        value={loginData.username} 
        onChange={e => setLoginData({...loginData, username: e.target.value})} 
        autoComplete="username"
        className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" 
      />
      <div className="relative">
        <input 
          required 
          type={showPass ? "text" : "password"} 
          placeholder="Mật khẩu" 
          value={loginData.password} 
          onChange={e => setLoginData({...loginData, password: e.target.value})} 
          autoComplete="current-password"
          className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" 
        />
        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-emerald-600">
          {showPass ? '👁️' : '🙈'}
        </button>
      </div>
      <div className="flex items-center gap-2 px-2">
        <input 
          type="checkbox" 
          id="rememberMe"
          checked={rememberMe} 
          onChange={() => setRememberMe(!rememberMe)} 
          className="w-4 h-4 accent-emerald-600 rounded" 
        />
        <label htmlFor="rememberMe" className="text-[10px] font-black text-slate-400 uppercase cursor-pointer">Duy trì đăng nhập</label>
      </div>
      <button 
        type="submit" 
        disabled={isLoading} 
        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
      >
        {isLoading ? 'ĐANG XỬ LÝ...' : 'ĐĂNG NHẬP NGAY'}
      </button>
      <div className="flex justify-between px-2">
        <button type="button" onClick={onSwitchRegister} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600">Đăng ký mới</button>
        <button type="button" onClick={onForgotPassword} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600">Quên mật khẩu?</button>
      </div>
    </form>
  );
};

export default memo(Login);
