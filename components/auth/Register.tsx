
import React, { useState, memo } from 'react';
import { HealthGoal } from '../../types.ts';

interface RegisterProps {
  onRegister: (data: any) => void;
  onSwitchLogin: () => void;
  isLoading: boolean;
  emailError: string | null;
  onCheckEmail: (email: string) => void;
}

const Register: React.FC<RegisterProps> = ({ onRegister, onSwitchLogin, isLoading, emailError, onCheckEmail }) => {
  const [regData, setRegData] = useState({
    username: '', email: '', password: '', fullName: '', phoneNumber: '',
    birthDate: '', height: 170, weight: 65,
    gender: 'Nam' as 'Nam'|'Nữ', healthGoal: HealthGoal.BODY_RECOMP
  });
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRegister(regData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in zoom-in-95">
      <input required placeholder="Họ và tên" value={regData.fullName} onChange={e => setRegData({...regData, fullName: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" />
      <input required placeholder="Tên đăng nhập" value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" />
      <input 
        required 
        type="email" 
        placeholder="Email" 
        value={regData.email} 
        onBlur={() => onCheckEmail(regData.email)} 
        onChange={e => setRegData({...regData, email: e.target.value})} 
        className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" 
      />
      {emailError && <p className="text-[10px] text-rose-500 font-black ml-2 uppercase">{emailError}</p>}
      <div className="relative">
        <input 
          required 
          type={showPass ? "text" : "password"} 
          placeholder="Mật khẩu" 
          value={regData.password} 
          onChange={e => setRegData({...regData, password: e.target.value})} 
          className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" 
        />
        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-emerald-600">
          {showPass ? '👁️' : '🙈'}
        </button>
      </div>
      <button 
        type="submit" 
        disabled={isLoading} 
        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
      >
        {isLoading ? 'ĐANG ĐĂNG KÝ...' : 'TẠO TÀI KHOẢN'}
      </button>
      <button type="button" onClick={onSwitchLogin} className="w-full text-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600">Đã có tài khoản? Đăng nhập</button>
    </form>
  );
};

export default memo(Register);
