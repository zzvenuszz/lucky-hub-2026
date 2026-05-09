
import React, { useState } from 'react';
import { User, UserRole } from '../../types.ts';
import BadgeDisplay from '../system/BadgeDisplay.tsx';
import AvatarEditor from './AvatarEditor.tsx';
import ProfileForm from './ProfileForm.tsx';

interface ProfileProps {
  user: User;
  onUpdate: (data: Partial<User>) => void;
  onNavigateToAdmin?: () => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdate, onNavigateToAdmin }) => {
  const [localData, setLocalData] = useState({
    fullName: user.fullName,
    email: user.email || '',
    height: user.height,
    weight: user.weight || 0,
    phoneNumber: user.phoneNumber || '',
    healthGoals: user.healthGoals || [],
    avatar: user.avatar || '',
    gender: user.gender
  });

  // Đồng bộ localData khi user prop thay đổi (ví dụ sau khi cập nhật thành công từ server)
  React.useEffect(() => {
    setLocalData({
      fullName: user.fullName,
      email: user.email || '',
      height: user.height,
      weight: user.weight || 0,
      phoneNumber: user.phoneNumber || '',
      healthGoals: user.healthGoals || [],
      avatar: user.avatar || '',
      gender: user.gender
    });
  }, [user]);

  const handleDataUpdate = (newData: any, shouldSubmit: boolean = true) => {
    setLocalData(prev => ({ ...prev, ...newData }));
    if (shouldSubmit) onUpdate(newData);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {user.role === UserRole.ADMIN && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-amber-200">🛡️</div>
            <div>
              <h4 className="font-black text-amber-800 text-sm uppercase tracking-widest">Quản trị viên</h4>
              <p className="text-xs text-amber-600 font-medium">Bạn có quyền truy cập hệ thống quản trị.</p>
            </div>
          </div>
          <button onClick={onNavigateToAdmin} className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95">Admin Panel</button>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <AvatarEditor 
          currentAvatar={localData.avatar} 
          gender={localData.gender} 
          fullName={localData.fullName} 
          onAvatarChange={(avatar) => handleDataUpdate({ avatar })} 
        />
        
        <div className="px-8 pt-16 flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-slate-800">{user.fullName}</h3>
            <BadgeDisplay badgeIds={user.badges} size="md" />
          </div>
          <p className="text-xs text-slate-400 font-medium">@{user.username}</p>
        </div>

        {/* 
          PHÂN TÍCH: Sau khi ProfileFormProps được cập nhật, hàm (d, submit) => handleDataUpdate(d, submit) 
          hoàn toàn tương thích với interface (data: any, shouldSubmit?: boolean) => void.
        */}
        <ProfileForm 
          user={user} 
          initialData={localData} 
          onUpdate={(d, submit) => handleDataUpdate(d, submit)} 
        />
      </div>
    </div>
  );
};

export default Profile;
