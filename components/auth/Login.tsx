
import React, { useState, memo } from 'react';

interface LoginProps {
  onLogin: (data: any) => void;
  onSwitchRegister: () => void;
  isLoading: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, onSwitchRegister, isLoading }) => {
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin({ ...loginData, rememberMe });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in zoom-in-95">
      <input 
        required 
        placeholder="Email hoặc Tên đăng nhập" 
        value={loginData.username} 
        onChange={e => setLoginData({...loginData, username: e.target.value})} 
        className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" 
      />
      <div className="relative">
        <input 
          required 
          type={showPass ? "text" : "password"} 
          placeholder="Mật khẩu" 
          value={loginData.password} 
          onChange={e => setLoginData({...loginData, password: e.target.value})} 
          className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" 
        />
        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-emerald-600">
          {showPass ? '👁️' : '🙈'}
        </button>
      </div>
      <div className="flex items-center gap-2 px-2">
        <input 
          type="checkbox" 
          checked={rememberMe} 
          onChange={() => setRememberMe(!rememberMe)} 
          className="w-4 h-4 accent-emerald-600 rounded" 
        />
        <span className="text-[10px] font-black text-slate-400 uppercase">Duy trì đăng nhập</span>
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
        <button type="button" className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600">Quên mật khẩu?</button>
      </div>
    </form>
  );
};

export default memo(Login);
