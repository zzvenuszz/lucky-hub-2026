import React, { useState } from 'react';
import { User } from '../types.ts';
import BadgeDisplay from './system/BadgeDisplay.tsx';
import AvatarEditor from './profile/AvatarEditor.tsx';

interface ProfileProps {
  user: User;
  onUpdate: (data: Partial<User>) => Promise<void>;
  onNavigateToAdmin: () => void;
}

const ProfileView: React.FC<ProfileProps> = ({ user, onUpdate, onNavigateToAdmin }) => {
  const [formData, setFormData] = useState<Partial<User>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveLocalChanges = async () => {
    setSaving(true);
    try {
      await onUpdate(formData);
      setIsEditing(false);
      setFormData({});
    } catch (err) {
      console.error('[Profile] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = (user as any).permissions?.includes('admin:panel');

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Hồ sơ người dùng</h2>
        <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">
          {isAdmin && '🔑 '}
          Nhóm: <span className="font-bold text-emerald-600">{(user as any).groupName || 'Chưa phân nhóm'}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Avatar Section */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 flex flex-col items-center gap-4">
            <AvatarEditor 
              currentAvatar={user.avatar} 
              gender={user.gender}
              fullName={user.fullName}
              onAvatarChange={async (newAvatar: string) => {
                await onUpdate({ avatar: newAvatar });
              }}
            />
            <div className="text-center">
              <p className="text-lg font-black text-slate-800">{user.fullName}</p>
              <p className="text-xs text-slate-400 font-black uppercase tracking-widest mt-1">
                @{user.username}
              </p>
            </div>
            <BadgeDisplay badgeIds={user.badges} />
          </div>
        </div>

        {/* Info Section */}
        <div className="lg:col-span-8 space-y-6">
          {/* Thông tin cá nhân */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-sm uppercase tracking-widest text-slate-800">Thông tin cá nhân</h3>
              {!isEditing && (
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="text-emerald-600 text-xs font-black uppercase tracking-wider hover:underline"
                >
                  ✏️ Chỉnh sửa
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Họ và tên</label>
                {isEditing ? (
                  <input type="text" defaultValue={user.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
                ) : (
                  <p className="font-bold text-sm text-slate-700">{user.fullName}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                {isEditing ? (
                  <input type="email" defaultValue={user.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
                ) : (
                  <p className="font-bold text-sm text-slate-700">{user.email}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Số điện thoại</label>
                {isEditing ? (
                  <input type="text" defaultValue={user.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
                ) : (
                  <p className="font-bold text-sm text-slate-700">{user.phoneNumber || '--'}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giới tính</label>
                <p className="font-bold text-sm text-slate-700">{user.gender}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ngày sinh</label>
                {isEditing ? (
                  <input type="date" defaultValue={user.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
                ) : (
                  <p className="font-bold text-sm text-slate-700">{user.birthDate ? new Date(user.birthDate).toLocaleDateString('vi-VN') : '--'}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chiều cao (cm)</label>
                {isEditing ? (
                  <input type="number" defaultValue={user.height} onChange={e => setFormData({...formData, height: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
                ) : (
                  <p className="font-bold text-sm text-slate-700">{user.height}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mục tiêu sức khỏe</label>
                <p className="font-bold text-sm text-slate-700">{(user.healthGoals || []).join(', ') || 'Chưa có'}</p>
              </div>
            </div>

            {isEditing && (
              <div className="flex gap-3 mt-6 pt-4 border-t border-slate-50">
                <button onClick={() => { setIsEditing(false); setFormData({}); }} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                  Hủy
                </button>
                <button onClick={handleSaveLocalChanges} disabled={saving} className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg">
                  {saving ? '🔄 Đang lưu...' : '💾 Lưu thay đổi'}
                </button>
              </div>
            )}
          </div>

          {/* Admin Quick Link */}
          {isAdmin && (
            <div className="bg-amber-50 rounded-[2rem] border border-amber-100 p-6 flex items-center justify-between">
              <div>
                <p className="font-black text-amber-700 uppercase tracking-widest text-xs">🛡️ Quản trị hệ thống</p>
                <p className="text-[10px] text-amber-500 font-medium mt-1">Quản lý người dùng, kiến thức, quy tắc AI</p>
              </div>
              <button onClick={onNavigateToAdmin} className="bg-amber-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-amber-200">
                Vào Admin
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileView;