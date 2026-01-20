
import React, { useState } from 'react';
import { User, HealthGoal, UserRole } from '../types.ts';

interface ProfileProps {
  user: User;
  onUpdate: (data: Partial<User>) => void;
  onNavigateToAdmin?: () => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdate, onNavigateToAdmin }) => {
  const [formData, setFormData] = useState({
    fullName: user.fullName,
    height: user.height,
    weight: user.weight || 0,
    phoneNumber: user.phoneNumber || '',
    healthGoal: user.healthGoal,
    avatar: user.avatar || '',
    gender: user.gender
  });

  const getAvatar = () => {
    if (formData.avatar) return formData.avatar;
    return formData.gender === 'Nữ'
      ? `https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=f8fafc`
      : `https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f8fafc`;
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Kích thước ảnh quá lớn (tối đa 2MB)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setFormData({ ...formData, avatar: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
    alert('Đã cập nhật thông tin thành công!');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Admin Quick Access Card */}
      {user.role === UserRole.ADMIN && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex items-center justify-between shadow-sm animate-pulse hover:animate-none transition-all">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-amber-200">🛡️</div>
            <div>
              <h4 className="font-black text-amber-800 text-sm uppercase tracking-widest">Đặc quyền Quản trị viên</h4>
              <p className="text-xs text-amber-600 font-medium">Bạn có quyền truy cập vào hệ thống quản lý toàn cục.</p>
            </div>
          </div>
          <button 
            onClick={onNavigateToAdmin}
            className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-amber-700 active:scale-95 transition-all shadow-md"
          >
            Vào Admin Panel
          </button>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden transition-all hover:shadow-md">
        <div className="bg-emerald-600 h-32 relative">
          <div className="absolute -bottom-12 left-8">
            <label className="relative cursor-pointer group block">
              <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-white">
                <img src={getAvatar()} alt={user.fullName} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity">
                <span className="text-[10px] font-black uppercase tracking-tighter">Thay đổi</span>
                <span className="text-lg">📸</span>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
            </label>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 pt-16 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800">Thông tin cá nhân</h3>
              <p className="text-xs text-slate-400 font-medium">Cập nhật hồ sơ để AI tư vấn chính xác hơn</p>
            </div>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">{user.role}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Họ và tên</label>
              <input required type="text" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Số điện thoại</label>
              <input required type="tel" value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Chiều cao (CM)</label>
              <input required type="number" value={formData.height} onChange={e => setFormData({...formData, height: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Cân nặng (KG)</label>
              <input required type="number" step="0.1" value={formData.weight} onChange={e => setFormData({...formData, weight: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium" />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Mục tiêu sức khỏe</label>
              <select value={formData.healthGoal} onChange={e => setFormData({...formData, healthGoal: e.target.value as HealthGoal})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium">
                {Object.values(HealthGoal).map(goal => <option key={goal} value={goal}>{goal}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-4">
            <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-[0.98] transition-all">
              Lưu thay đổi hồ sơ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;
