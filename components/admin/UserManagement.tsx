import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { User, AccountStatus, HealthGoal } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { useToast } from '../system/ToastProvider.tsx';
import { useBodyScrollLock, useModalStack } from '../system/ModalManager.tsx';
import LoadingButton from '../system/LoadingButton.tsx';
import UserGroupLoading from './UserGroupLoading.tsx';

interface UserManagementProps {
  users: User[];
  onRefresh: () => void;
  canManageMemberLevels: boolean;
}

interface Group {
  _id: string;
  id: string;
  name: string;
  permissions: string[];
  isDefault: boolean;
  members: any[];
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onRefresh, canManageMemberLevels }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const editModalId = useMemo(() => `user-edit_${Math.random().toString(36).slice(2, 9)}`, []);
  const deleteModalId = useMemo(() => `user-delete_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(!!editingUser || !!deletingUser);
  useModalStack(editModalId, () => setEditingUser(null));
  useModalStack(deleteModalId, () => setDeletingUser(null));
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  // Lấy userId an toàn
  const getUserId = useCallback((u: any): string => u.id || u._id, []);

  // Build map userId → group name từ tất cả groups
  const userGroupMap = useMemo(() => {
    const map: Record<string, string> = {};
    allGroups.forEach(group => {
      const gid = group.id || group._id;
      const memberIds = (group.members || []).map((m: any) => m._id || m);
      memberIds.forEach(mid => {
        map[mid] = group.name;
      });
    });
    return map;
  }, [allGroups]);

  // Load nhóm một lần khi mở trang quản trị; danh sách user refresh không làm đổi groups.
  useEffect(() => {
    Database.getGroups().then(setAllGroups).catch(() => {});
  }, []);

  // Load danh sách groups khi mở modal edit
  const loadUserGroups = useCallback(async (userId: string) => {
    try {
      const [availableGroups, userGroups] = await Promise.all([
        allGroups.length ? Promise.resolve(allGroups) : Database.getGroups(),
        Database.getUserGroups(userId),
      ]);
      setGroups(availableGroups || []);
      if (!allGroups.length) setAllGroups(availableGroups || []);
      // Lấy group ID đầu tiên user thuộc về (single group)
      const currentGroup = (userGroups || [])[0];
      setSelectedGroupId(currentGroup ? (currentGroup._id || currentGroup.id) : '');
    } catch (err: any) {
      console.error('[UserManagement] Load groups error:', err);
    }
  }, [allGroups]);

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    const uid = getUserId(editingUser);
    console.log('[UserManagement] Member profile update started:', { userId: uid });
    const originalUser = users.find(user => getUserId(user) === uid);

    const requestedLevel = editingUser.memberLevel || 'customer';
    const memberNumber = String(editingUser.memberNumber || '').trim().toUpperCase();
    const sponsorMemberNumber = String(editingUser.sponsorMemberNumber || '').trim().toUpperCase();
    const updateData: any = {
      username: editingUser.username,
      email: editingUser.email,
      fullName: editingUser.fullName,
      status: editingUser.status,
      birthDate: editingUser.birthDate || '',
      height: Number(editingUser.height || 0),
      weight: Number(editingUser.weight || 0),
      gender: editingUser.gender || 'Nam',
      healthGoals: editingUser.healthGoals || [],
      avatar: editingUser.avatar || '',
    };
    if (memberNumber !== String(originalUser?.memberNumber || '').trim().toUpperCase()) updateData.memberNumber = memberNumber;
    if (sponsorMemberNumber !== String(originalUser?.sponsorMemberNumber || '').trim().toUpperCase()) updateData.sponsorMemberNumber = sponsorMemberNumber;
    if ('phoneNumber' in editingUser) updateData.phoneNumber = editingUser.phoneNumber || '';
    if ('address' in editingUser) updateData.address = editingUser.address || '';
    if ((editingUser as any).password && (editingUser as any).password.trim() !== '') {
      updateData.password = (editingUser as any).password;
    }

    try {
      await Database.updateUser(uid, updateData);
      console.log('[UserManagement] Member profile fields saved:', { userId: uid });
      if (canManageMemberLevels && memberNumber && requestedLevel !== (originalUser?.memberLevel || 'customer')) {
        await Database.inventory.setMemberLevel(uid, { memberLevel: requestedLevel, reason: 'Cập nhật cấp độ từ Admin Panel' });
      } else if (canManageMemberLevels && !memberNumber && requestedLevel !== 'customer') {
        console.log('[UserManagement] Member level reset to customer because member number was cleared:', { userId: uid });
      }

      // Cập nhật group membership (single group), cho phép bỏ khỏi mọi nhóm.
      try {
        const freshGroups = await Database.getGroups();
        for (const group of freshGroups) {
          const gid = group.id || group._id;
          if (gid === selectedGroupId) continue;
          const currentMembers = group.members?.map((m: any) => m._id || m) || [];
          if (currentMembers.includes(uid)) {
            await Database.updateGroupMembers(gid, currentMembers.filter((id: string) => id !== uid));
          }
        }
        if (selectedGroupId) {
          // Thêm user vào group được chọn
          const targetGroup = freshGroups.find((group: any) => (group.id || group._id) === selectedGroupId);
          if (targetGroup) {
            const targetId = targetGroup.id || targetGroup._id;
            const targetMembers = targetGroup.members?.map((member: any) => member._id || member) || [];
            if (!targetMembers.includes(uid)) await Database.updateGroupMembers(targetId, [...targetMembers, uid]);
          }
        }
        const updatedGroups = await Database.getGroups();
        setAllGroups(updatedGroups || []);
      } catch (groupErr: any) {
        console.error('[UserManagement] Group update error:', groupErr);
      }

      // ĐÓNG MODAL VÀ REFRESH SAU CÙNG
      setEditingUser(null);
      console.log('[UserManagement] Member profile update completed:', { userId: uid });
      addToast({ type: 'success', title: 'Đã cập nhật', message: 'Thông tin hội viên đã được lưu.' });
      onRefresh();
    } catch (err: any) {
      console.error('[UserManagement] Member profile update failed:', { userId: uid, error: err });
      addToast({ type: 'error', title: 'Lỗi', message: err.message || 'Không thể cập nhật.' });
    } finally {
      setSaving(false);
    }
  };

  // Gửi email khôi phục mật khẩu cho người dùng
  const handleSendResetEmail = async (user: User) => {
    const uid = getUserId(user);
    setSendingEmail(uid);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/users/${uid}/send-reset-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorName: 'Admin' }),
      });
      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: 'Email đã gửi', message: `Email khôi phục đã gửi đến ${user.email}` });
      } else {
        setActionMessage({ type: 'error', text: data.message || 'Không thể gửi email' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: 'Lỗi kết nối: ' + err.message });
    } finally {
      setSendingEmail(null);
    }
  };

  // Xóa người dùng
  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    const uid = getUserId(deletingUser);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/users/${uid}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: 'Đã xóa', message: `Người dùng ${deletingUser.fullName} đã được xóa.` });
      } else {
        setActionMessage({ type: 'error', text: data.message || 'Không thể xóa người dùng' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: 'Lỗi kết nối: ' + err.message });
    } finally {
      setDeletingUser(null);
      onRefresh();
    }
  };

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row gap-4">
        <input 
          placeholder="Tìm hội viên..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          className="flex-1 px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner font-medium" 
        />
      </div>

      {/* 📱 Mobile Card View */}
      <div className="mobile-only space-y-3">
        {filteredUsers.map(u => {
          const uid = getUserId(u);
          const groupName = userGroupMap[uid];
          const statusActive = u.status === AccountStatus.ACTIVE;

          return (
            <div key={uid} className="data-card">
              {/* Header: Avatar + Name + Status */}
              <div className="data-card-header">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-sm shrink-0">
                    {u.fullName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-800 truncate">{u.fullName}</div>
                    <div className="text-[10px] text-slate-400 truncate">@{u.username}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase shrink-0 ${statusActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {u.status}
                  </span>
                </div>
              </div>

              {/* Body: Group */}
              <div className="data-card-body">
                <div className="data-card-row">
                  <span className="data-card-label">Nhóm</span>
                  <span className="data-card-value">
                    {allGroups.length === 0 ? (
                      <span className="text-slate-400 text-[10px]">Đang tải...</span>
                    ) : groupName ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                        groupName.toLowerCase().includes('admin') ? 'bg-red-50 text-red-600' :
                        groupName.toLowerCase().includes('coach') ? 'bg-amber-50 text-amber-600' :
                        'bg-emerald-50 text-emerald-600'
                      }`}>
                        {groupName.toLowerCase().includes('admin') ? '🔑' :
                         groupName.toLowerCase().includes('coach') ? '📋' :
                         '🌱'} {groupName}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Chưa có nhóm</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="data-card-actions">
                <button 
                  onClick={() => { setEditingUser(u); loadUserGroups(uid); }}
                  className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all"
                >
                  ✏️ Sửa
                </button>
                <button 
                  onClick={() => handleSendResetEmail(u)}
                  disabled={sendingEmail === uid}
                  className={`flex-1 py-2 rounded-xl bg-amber-50 text-amber-600 font-black text-[9px] uppercase tracking-wider transition-all ${sendingEmail === uid ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-100'}`}
                >
                  {sendingEmail === uid ? '⏳' : '📧'} Email
                </button>
                <button 
                  onClick={() => setDeletingUser(u)}
                  className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-600 font-black text-[9px] uppercase tracking-wider hover:bg-rose-100 transition-all"
                >
                  🗑️ Xóa
                </button>
              </div>
            </div>
          );
        })}
        {filteredUsers.length === 0 && (
          <div className="p-10 text-center text-slate-300 italic text-[11px] font-bold">Không tìm thấy hội viên</div>
        )}
      </div>

      {/* 💻 Desktop Table View */}
      <div className="table-desktop">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-50 font-black uppercase text-[10px] tracking-widest">
              <th className="pb-4">Hội viên</th>
              <th className="pb-4">Nhóm</th>
              <th className="pb-4">Trạng thái</th>
              <th className="pb-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredUsers.map(u => {
              const uid = getUserId(u);
              const groupName = userGroupMap[uid];
              const isActive = u.status === AccountStatus.ACTIVE;
              return (
                <tr key={uid} className="group hover:bg-slate-50/20">
                  <td className="py-5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                      {u.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800">{u.fullName}</div>
                      <div className="text-[10px] text-slate-400">@{u.username}</div>
                    </div>
                  </td>
                  <td>
                    {allGroups.length === 0 ? (
                      <span role="status" className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase inline-flex items-center gap-1">
                        <UserGroupLoading />
                        Đang tải...
                      </span>
                    ) : groupName ? (
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                        groupName.toLowerCase().includes('admin') ? 'bg-red-50 text-red-600' :
                        groupName.toLowerCase().includes('coach') ? 'bg-amber-50 text-amber-600' :
                        'bg-emerald-50 text-emerald-600'
                      }`}>
                        {groupName.toLowerCase().includes('admin') ? '🔑' :
                         groupName.toLowerCase().includes('coach') ? '📋' :
                         '🌱'} {groupName}
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg text-[9px] font-black uppercase">
                        Chưa có nhóm
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="text-right space-x-2">
                    <button 
                      onClick={() => {
                        setEditingUser(u);
                        loadUserGroups(uid);
                      }} 
                      className="text-emerald-600 font-black text-[9px] hover:underline"
                    >
                      Sửa
                    </button>
                    <button 
                      onClick={() => handleSendResetEmail(u)} 
                      disabled={sendingEmail === uid}
                      className={`text-amber-600 font-black text-[9px] hover:underline ${sendingEmail === uid ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {sendingEmail === uid ? 'Đang gửi...' : 'Gửi email khôi phục'}
                    </button>
                    <button 
                      onClick={() => setDeletingUser(u)} 
                      className="text-rose-600 font-black text-[9px] hover:underline"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action Message Toast */}
      {actionMessage && (
        <div className={`fixed top-6 right-6 z-[1300] px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right font-bold text-sm ${actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {actionMessage.text}
          <button onClick={() => setActionMessage(null)} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 text-center">
            <div className="text-5xl mb-2">⚠️</div>
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Xác nhận xóa</h4>
            <p className="text-slate-600 text-sm leading-relaxed">
              Bạn có chắc chắn muốn xóa người dùng <strong>{deletingUser.fullName}</strong> (@{deletingUser.username})?
              <br />
              <span className="text-rose-500 text-[10px] font-black mt-2 block">
                Tất cả dữ liệu liên quan (chỉ số, bài viết, mục tiêu, chat) sẽ bị xóa vĩnh viễn!
              </span>
            </p>
            <div className="flex gap-3 pt-4">
              <button 
                type="button" 
                onClick={() => setDeletingUser(null)} 
                className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px] hover:bg-slate-200 transition-all"
              >
                Hủy
              </button>
              <button 
                onClick={handleDeleteUser} 
                className="flex-1 py-4 rounded-2xl bg-rose-600 text-white font-black uppercase text-[11px] shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateUser(); }} className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 max-h-[85vh] overflow-y-auto">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Cập nhật Hội viên</h4>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên đăng nhập</label>
                <input required value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Email</label>
                <input required type="email" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Họ tên</label>
                <input required value={editingUser.fullName || ''} onChange={e => setEditingUser({...editingUser, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Số điện thoại</label>
                <input type="tel" value={editingUser.phoneNumber || ''} onChange={e => setEditingUser({...editingUser, phoneNumber: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Địa chỉ</label>
              <input value={editingUser.address || ''} onChange={e => setEditingUser({...editingUser, address: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mã số hội viên</label>
                <input value={editingUser.memberNumber || ''} onChange={e => { const memberNumber = e.target.value.toUpperCase(); const memberLevel = !memberNumber ? 'customer' : (!editingUser.memberNumber && (editingUser.memberLevel || 'customer') === 'customer' ? 'member' : editingUser.memberLevel); setEditingUser({...editingUser, memberNumber, memberLevel}); }} placeholder="VA12345678 hoặc VNY1234567" className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs uppercase" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mã người bảo trợ</label>
                <input value={editingUser.sponsorMemberNumber || ''} onChange={e => setEditingUser({...editingUser, sponsorMemberNumber: e.target.value.toUpperCase()})} placeholder="Mã hội viên người bảo trợ" className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs uppercase" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ngày sinh</label>
                <input type="date" value={String(editingUser.birthDate || '').slice(0, 10)} onChange={e => setEditingUser({...editingUser, birthDate: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Giới tính</label>
                <select value={editingUser.gender || 'Nam'} onChange={e => setEditingUser({...editingUser, gender: e.target.value as User['gender']})} className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold text-xs"><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Chiều cao (cm)</label>
                <input type="number" min="0" value={editingUser.height || 0} onChange={e => setEditingUser({...editingUser, height: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân nặng (kg)</label>
                <input type="number" min="0" step="0.1" value={editingUser.weight || 0} onChange={e => setEditingUser({...editingUser, weight: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mục tiêu sức khỏe</label>
              <div className="grid gap-1 sm:grid-cols-2 rounded-xl bg-slate-50 p-3">
                {Object.values(HealthGoal).map(goal => <label key={goal} className="flex items-center gap-2 rounded-lg p-2 text-xs font-semibold text-slate-700 hover:bg-white"><input type="checkbox" checked={(editingUser.healthGoals || []).includes(goal)} onChange={e => { const currentGoals = editingUser.healthGoals || []; const healthGoals = e.target.checked ? [...currentGoals, goal] : currentGoals.filter(value => value !== goal); setEditingUser({...editingUser, healthGoals}); }} className="accent-emerald-600" />{goal}</label>)}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ảnh đại diện (URL)</label>
              <input type="url" value={editingUser.avatar || ''} onChange={e => setEditingUser({...editingUser, avatar: e.target.value})} placeholder="https://..." className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Trạng thái tài khoản</label>
              <select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value as AccountStatus})} className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold text-xs">
                {Object.values(AccountStatus).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mật khẩu mới (Để trống nếu không đổi)</label>
              <input 
              type="password"
              autoComplete="new-password"
                placeholder="Nhập mật khẩu mới..."
                onChange={e => setEditingUser({...editingUser, password: e.target.value})} 
                className="w-full px-4 py-3 bg-rose-50/30 text-rose-700 rounded-xl outline-none font-bold text-xs border border-rose-100 focus:border-rose-300" 
              />
            </div>

            {/* Group Selector - Single select */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
                👥 Nhóm
                <span className="font-normal text-[9px] text-slate-300">(chọn 1 nhóm cho hội viên)</span>
              </label>
              <div className="space-y-1.5">
                <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${selectedGroupId ? 'bg-slate-50 border-transparent hover:border-slate-200' : 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'}`}>
                  <input type="radio" name="userGroup" checked={!selectedGroupId} onChange={() => setSelectedGroupId('')} className="accent-emerald-600" />
                  <span className="font-bold text-xs text-slate-700">Không thuộc nhóm</span>
                </label>
                {groups.map(group => {
                  const gid = group.id || group._id;
                  const isSelected = selectedGroupId === gid;
                  return (
                    <label 
                      key={gid} 
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                        isSelected 
                          ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200' 
                          : 'bg-slate-50 border-transparent hover:border-slate-200'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="userGroup"
                        checked={isSelected}
                        onChange={() => setSelectedGroupId(gid)}
                        className="accent-emerald-600"
                      />
                      <div>
                        <div className="font-bold text-xs text-slate-700 flex items-center gap-2">
                          {group.name}
                          {group.isDefault && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[7px] font-black uppercase">⭐</span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {groups.length === 0 && (
                  <div className="p-4 text-center text-slate-400 text-[10px] italic">
                    Chưa có nhóm nào. Vào "Quản lý nhóm" để tạo nhóm trước.
                  </div>
                )}
              </div>
            </div>

            {canManageMemberLevels && <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cấp độ hội viên</label>
              <select value={editingUser.memberLevel || 'customer'} onChange={e => setEditingUser({...editingUser, memberLevel: e.target.value as User['memberLevel']})} className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold text-xs">
                <option value="customer">Khách hàng</option><option value="member" disabled={!editingUser.memberNumber}>Hội viên</option><option value="senior_consultant" disabled={!editingUser.memberNumber}>Tư vấn viên cao cấp</option><option value="success_builder" disabled={!editingUser.memberNumber}>Nhà kiến tạo thành công</option><option value="supervisor" disabled={!editingUser.memberNumber}>Giám sát viên</option>
              </select>
              {editingUser.memberLevel !== 'customer' && !editingUser.memberNumber && <p className="text-[10px] text-amber-700">Cần có mã hội viên trước khi gán cấp độ này.</p>}
            </div>}

            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px] hover:bg-slate-200 transition-all active:scale-[0.97]">Hủy</button>
              <LoadingButton type="button" onClick={handleUpdateUser} disabled={saving} variant="primary" size="md" loadingText="Đang lưu..." className="!flex-1 !py-4 !rounded-2xl !text-[11px]">
                Lưu thông tin
              </LoadingButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default memo(UserManagement);
