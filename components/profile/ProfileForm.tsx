
import React, { useState, memo } from 'react';
import { User, HealthGoal } from '../../types.ts';

interface ProfileFormProps {
  user: User;
  initialData: any;
  /**
   * PHÂN TÍCH: Cần mở rộng kiểu của onUpdate để chấp nhận tham số thứ 2 (shouldSubmit)
   * nhằm tương thích với logic cập nhật tức thì (false) và cập nhật khi submit (true/mặc định).
   */
  onUpdate: (data: any, shouldSubmit?: boolean) => void;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ user, initialData, onUpdate }) => {
  const [formData, setFormData] = useState(initialData);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Đồng bộ formData khi initialData thay đổi (ví dụ khi AvatarEditor cập nhật avatar)
  React.useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const checkEmailExists = async (email: string) => {
    if (email === user.email) { setEmailError(null); return; }
    try {
      const res = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, excludeUserId: (user as any).id || (user as any)._id })
      });
      const data = await res.json();
      if (data.exists) setEmailError('Email này đã được sử dụng');
      else setEmailError(null);
    } catch { console.error('Lỗi check email'); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError) return;
    onUpdate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="p-8 pt-16 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Họ và tên</label>
          {/* SỬA LỖI: Truyền false cho shouldSubmit để chỉ cập nhật state cục bộ ở component cha mà không gọi API ngay */}
          <input required type="text" value={formData.fullName} onChange={e => { const d = {...formData, fullName: e.target.value}; setFormData(d); onUpdate(d, false); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Email</label>
          <input required type="email" value={formData.email} onBlur={() => checkEmailExists(formData.email)} onChange={e => setFormData({...formData, email: e.target.value})} className={`w-full px-4 py-3 rounded-xl border-2 outline-none text-sm font-medium ${emailError ? 'border-rose-400 bg-rose-50/10' : 'border-transparent bg-slate-50 focus:border-emerald-500'}`} />
          {emailError && <p className="text-[9px] text-rose-500 font-bold ml-1">{emailError}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Số điện thoại</label>
          {/* SỬA LỖI: Truyền false cho shouldSubmit */}
          <input required type="tel" value={formData.phoneNumber} onChange={e => { const d = {...formData, phoneNumber: e.target.value}; setFormData(d); onUpdate(d, false); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Chiều cao (CM)</label>
          <input required type="number" value={formData.height} onChange={e => { const d = {...formData, height: Number(e.target.value)}; setFormData(d); onUpdate(d, false); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Giới tính</label>
          <select value={formData.gender} onChange={e => { const d = {...formData, gender: e.target.value as 'Nam'|'Nữ'}; setFormData(d); onUpdate(d, false); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium">
            <option value="Nam">Nam</option>
            <option value="Nữ">Nữ</option>
          </select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Mục tiêu sức khỏe (Chọn nhiều mục)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-slate-50 rounded-xl">
            {Object.values(HealthGoal).map(goal => (
              <label key={goal} className="flex items-center space-x-3 cursor-pointer hover:bg-white/50 p-2 rounded-lg transition-colors">
                <input 
                  type="checkbox" 
                  checked={(formData.healthGoals || []).includes(goal)} 
                  onChange={e => {
                    const currentGoals = formData.healthGoals || [];
                    const newGoals = e.target.checked 
                      ? [...currentGoals, goal]
                      : currentGoals.filter((g: string) => g !== goal);
                    const d = {...formData, healthGoals: newGoals};
                    setFormData(d);
                    onUpdate(d, false);
                  }}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">{goal}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-emerald-700 transition-all">
        Cập nhật hồ sơ hội viên
      </button>
    </form>
  );
};

export default memo(ProfileForm);
