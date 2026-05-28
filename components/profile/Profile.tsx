
import React, { useState, useEffect, useCallback, memo } from 'react';
import { User, UserRole, NutritionGroup } from '../../types.ts';
import BadgeDisplay from '../system/BadgeDisplay.tsx';
import AvatarEditor from './AvatarEditor.tsx';
import ProfileForm from './ProfileForm.tsx';
import { Database } from '../../services/database.ts';

interface ProfileProps {
  user: User;
  onUpdate: (data: Partial<User>) => void;
  onNavigateToAdmin?: () => void;
}

const Profile: React.FC<ProfileProps> = memo(({ user, onUpdate, onNavigateToAdmin }) => {
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
  const [nutritionGroup, setNutritionGroup] = useState<any>(null);
  const [pendingGroup, setPendingGroup] = useState<any>(null);
  const [nutritionGroups, setNutritionGroups] = useState<NutritionGroup[]>([]);
  const [showNDDSelector, setShowNDDSelector] = useState(false);
  const [selectedNDDId, setSelectedNDDId] = useState('');
  const [nddLoading, setNddLoading] = useState(false);
  const [nddMessage, setNddMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch NDD info
  const fetchNDD = useCallback(async () => {
    try {
      const data = await Database.getMyNutritionGroup();
      if (data) {
        setNutritionGroup(data.group);
        setPendingGroup(data.pendingGroup);
      }
    } catch (err) {
      console.error('[Profile] Failed to load NDD:', err);
    }
  }, []);

  useEffect(() => { fetchNDD(); }, [fetchNDD]);

  // Fetch all NDDs for selector
  const fetchAllNDD = useCallback(async () => {
    setNddLoading(true);
    try {
      const data = await Database.getNutritionGroups();
      setNutritionGroups(data || []);
    } catch (err) {
      console.error('[Profile] Failed to load NDDs:', err);
    } finally {
      setNddLoading(false);
    }
  }, []);

  const handleOpenNDDSelector = useCallback(() => {
    fetchAllNDD();
    setShowNDDSelector(true);
    setNddMessage(null);
  }, [fetchAllNDD]);

  const handleRequestJoin = useCallback(async () => {
    if (!selectedNDDId) return;
    setNddLoading(true);
    setNddMessage(null);
    try {
      const result = await Database.joinNutritionGroup(selectedNDDId);
      if (result) {
        setNddMessage({ type: 'success', text: result.message || 'Yêu cầu đã được gửi!' });
        setShowNDDSelector(false);
        fetchNDD();
      }
    } catch (err: any) {
      setNddMessage({ type: 'error', text: err.message || 'Có lỗi xảy ra' });
    } finally {
      setNddLoading(false);
    }
  }, [selectedNDDId, fetchNDD]);

  const handleCancelRequest = useCallback(async () => {
    if (!pendingGroup?.id) return;
    setNddLoading(true);
    try {
      const result = await Database.cancelNutritionGroupRequest(pendingGroup.id);
      if (result) {
        setNddMessage({ type: 'success', text: 'Đã hủy yêu cầu chuyển NDD.' });
        setPendingGroup(null);
        fetchNDD();
      }
    } catch (err: any) {
      setNddMessage({ type: 'error', text: err.message || 'Có lỗi xảy ra' });
    } finally {
      setNddLoading(false);
    }
  }, [pendingGroup, fetchNDD]);

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

  const handleDataUpdate = async (newData: any, shouldSubmit: boolean = true) => {
    setLocalData(prev => ({ ...prev, ...newData }));
    if (shouldSubmit) await onUpdate(newData);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {(user as any).permissions?.includes('admin:panel') && (
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

        {/* Nutrition Group (NDD) Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-lg">🏥</div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Nhóm Dinh Dưỡng (NDD)</h4>
                <p className="text-[10px] text-slate-400 font-medium">Nhóm sinh hoạt của bạn</p>
              </div>
            </div>
          </div>

          {nutritionGroup ? (
            <div className="bg-emerald-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-emerald-800">{nutritionGroup.name}</p>
                  <p className="text-[10px] text-emerald-600 font-medium">Chủ vận hành: {nutritionGroup.ownerName}</p>
                  {nutritionGroup.address && (
                    <p className="text-[10px] text-emerald-500">📍 {nutritionGroup.address}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-xs text-slate-400 font-medium">Bạn chưa thuộc NDD nào</p>
            </div>
          )}

          {pendingGroup && (
            <div className="mt-3 bg-amber-50 rounded-2xl p-4 border border-amber-200">
              <div className="flex items-center gap-2">
                <span className="text-lg">⏳</span>
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-700">Đang chờ phê duyệt</p>
                  <p className="text-[10px] text-amber-600">Yêu cầu chuyển đến "{pendingGroup.name}"</p>
                </div>
                <button
                  onClick={handleCancelRequest}
                  disabled={nddLoading}
                  className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-xl text-[10px] font-bold hover:bg-amber-200 transition-all"
                >
                  {nddLoading ? '...' : 'Hủy'}
                </button>
              </div>
            </div>
          )}

          {nddMessage && (
            <div className={`mt-3 px-4 py-3 rounded-2xl text-xs font-bold ${
              nddMessage.type === 'success' 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {nddMessage.text}
            </div>
          )}

          {!showNDDSelector ? (
            <button
              onClick={handleOpenNDDSelector}
              className="mt-3 w-full py-3 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all"
            >
              {nutritionGroup ? '🔄 ĐỔI NDD' : '📋 CHỌN NDD'}
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              <select
                value={selectedNDDId}
                onChange={e => setSelectedNDDId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 rounded-2xl border-none outline-none font-bold text-sm"
                disabled={nddLoading}
              >
                <option value="">-- Chọn NDD --</option>
                {nutritionGroups.map(g => {
                  const gid = (g as any).id || (g as any)._id;
                  const isCurrent = nutritionGroup?.id === gid;
                  return (
                    <option key={gid} value={gid} disabled={isCurrent}>
                      {g.name} - {g.address} {isCurrent ? '(hiện tại)' : ''}
                    </option>
                  );
                })}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNDDSelector(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl text-xs font-bold hover:bg-slate-200 transition-all"
                >
                  Hủy
                </button>
                <button
                  onClick={handleRequestJoin}
                  disabled={!selectedNDDId || nddLoading}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  {nddLoading ? 'Đang gửi...' : 'Gửi yêu cầu'}
                </button>
              </div>
            </div>
          )}
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
});

Profile.displayName = 'Profile';

export default Profile;
