
import React, { useState, useEffect, memo } from 'react';
import { HealthGoal, NutritionGroup } from '../../types.ts';
import AvatarUpload from './AvatarUpload';

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
    gender: 'Nam' as 'Nam'|'Nữ', healthGoals: [] as HealthGoal[],
    nutritionGroupId: '',
    avatar: '' as string
  });
  const [avatarValid, setAvatarValid] = useState<boolean | null>(null);
  const [avatarValidationReason, setAvatarValidationReason] = useState<string>('');
  const [nutritionGroups, setNutritionGroups] = useState<NutritionGroup[]>([]);
  const [showPass, setShowPass] = useState(false);
  const [step, setStep] = useState(1);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Fetch NDD list for registration
  useEffect(() => {
    const fetchGroups = async () => {
      setLoadingGroups(true);
      try {
        const resp = await fetch('/api/nutrition-groups/public');
        if (resp.ok) {
          const data = await resp.json();
          setNutritionGroups(data || []);
        }
      } catch (err) {
        console.error('[Register] Failed to load nutrition groups:', err);
      } finally {
        setLoadingGroups(false);
      }
    };
    fetchGroups();
  }, []);

  // Xử lý khi avatar thay đổi
  const handleAvatarChange = (base64: string | null) => {
    setRegData(prev => ({ ...prev, avatar: base64 || '' }));
  };

  // Xử lý kết quả validation avatar
  const handleAvatarValidation = (valid: boolean | null, reason?: string) => {
    setAvatarValid(valid);
    if (!valid && reason) {
      setAvatarValidationReason(reason);
    } else {
      setAvatarValidationReason('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      // Kiểm tra avatar trước khi qua bước 2
      if (!regData.avatar) {
        alert('Vui lòng chọn ảnh đại diện');
        return;
      }
      if (avatarValid !== true) {
        if (avatarValid === null) {
          alert('Vui lòng đợi xác thực ảnh đại diện hoặc chọn ảnh khác');
        } else {
          alert('Ảnh đại diện không hợp lệ. Vui lòng chọn ảnh khác.\n' + avatarValidationReason);
        }
        return;
      }
      setStep(2);
    } else {
      onRegister(regData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in zoom-in-95">
      {step === 1 ? (
        <>
          {/* Avatar Upload Section */}
          <AvatarUpload
            onAvatarChange={handleAvatarChange}
            isValid={avatarValid}
            onValidationChange={handleAvatarValidation}
          />
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
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
          >
            TIẾP THEO
          </button>
        </>
      ) : (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Giới tính</label>
              <select value={regData.gender} onChange={e => setRegData({...regData, gender: e.target.value as any})} className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner">
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Số điện thoại</label>
              <input required type="tel" placeholder="Số điện thoại" value={regData.phoneNumber} onChange={e => setRegData({...regData, phoneNumber: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Chiều cao (cm)</label>
              <input required type="number" value={regData.height} onChange={e => setRegData({...regData, height: Number(e.target.value)})} className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Cân nặng (kg)</label>
              <input required type="number" value={regData.weight} onChange={e => setRegData({...regData, weight: Number(e.target.value)})} className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner" />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Mục tiêu sức khỏe (Chọn nhiều mục)</label>
            <div className="grid grid-cols-1 gap-2 p-4 bg-slate-50 rounded-2xl shadow-inner">
              {Object.values(HealthGoal).map(goal => (
                <label key={goal} className="flex items-center space-x-3 cursor-pointer p-1">
                  <input 
                    type="checkbox" 
                    checked={regData.healthGoals.includes(goal)} 
                    onChange={e => {
                      const newGoals = e.target.checked 
                        ? [...regData.healthGoals, goal]
                        : regData.healthGoals.filter(g => g !== goal);
                      setRegData({...regData, healthGoals: newGoals});
                    }}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span className="text-xs font-bold text-slate-600">{goal}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Nutrition Group Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nhóm Dinh Dưỡng (NDD)</label>
            <select
              value={regData.nutritionGroupId}
              onChange={e => setRegData({...regData, nutritionGroupId: e.target.value})}
              className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner"
              disabled={loadingGroups}
            >
              <option value="">-- Chọn NDD của bạn --</option>
              {nutritionGroups.map(g => {
                const gid = (g as any).id || (g as any)._id;
                return (
                  <option key={gid} value={gid}>
                    {g.name} - {g.address} ({(g as any).memberCount || 0} hội viên)
                  </option>
                );
              })}
              {nutritionGroups.length === 0 && !loadingGroups && (
                <option value="" disabled>Chưa có NDD nào. Vui lòng liên hệ Admin.</option>
              )}
            </select>
            {regData.nutritionGroupId && (
              <p className="text-[9px] text-emerald-600 font-bold ml-1">
                ✅ Bạn sẽ được thêm vào NDD này sau khi đăng ký
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <button 
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 py-4 bg-slate-200 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-300 transition-all"
            >
              QUAY LẠI
            </button>
            <button 
              type="submit" 
              disabled={isLoading} 
              className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
            >
              {isLoading ? 'ĐANG ĐĂNG KÝ...' : 'HOÀN TẤT ĐĂNG KÝ'}
            </button>
          </div>
        </div>
      )}
      <button type="button" onClick={onSwitchLogin} className="w-full text-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600">Đã có tài khoản? Đăng nhập</button>
    </form>
  );
};

export default memo(Register);
