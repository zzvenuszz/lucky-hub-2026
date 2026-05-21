import React, { useState, useEffect, useCallback, memo } from 'react';
import { Database } from '../../../services/database.ts';

interface NutritionGroup {
  _id: string;
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  address: string;
  members: any[];
  isActive: boolean;
  pendingMembers: { userId: string; fromNutritionGroupId: string; requestedAt: string; userName?: string }[];
  memberCount?: number;
}

interface NutritionGroupManagerProps {
  users: any[];
  onRefresh: () => void;
}

const NutritionGroupManager: React.FC<NutritionGroupManagerProps> = ({ users, onRefresh }) => {
  const [groups, setGroups] = useState<NutritionGroup[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingGroup, setEditingGroup] = useState<NutritionGroup | null>(null);
  const [viewPending, setViewPending] = useState<NutritionGroup | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newGroup, setNewGroup] = useState({ name: '', ownerId: '', address: '' });

  const [coachIds, setCoachIds] = useState<string[]>([]);

  const loadGroups = useCallback(async () => {
    try {
      const data = await Database.getAllNutritionGroups();
      setGroups(data || []);
    } catch (err: any) {
      console.error('[NutritionGroupManager] Load error:', err);
    }
  }, []);

  // Lấy danh sách user thuộc group HLV
  const loadCoachIds = useCallback(async () => {
    try {
      const allGroups = await Database.getGroups();
      const hlvGroup = allGroups.find((g: any) => g.name?.toLowerCase() === 'hlv');
      if (hlvGroup) {
        const memberIds = (hlvGroup.members || []).map((m: any) => m._id || m);
        setCoachIds(memberIds);
      }
    } catch (err) {
      console.error('[NutritionGroupManager] Load coach ids error:', err);
    }
  }, []);

  useEffect(() => { loadGroups(); loadCoachIds(); }, [loadGroups, loadCoachIds]);

  const handleCreate = async () => {
    if (!newGroup.name.trim()) {
      setActionMsg({ type: 'error', text: '❌ Tên NDD là bắt buộc' });
      return;
    }
    try {
      const owner = users.find(u => (u.id || u._id) === newGroup.ownerId);
      await Database.createNutritionGroup({
        name: newGroup.name.trim(),
        ownerId: newGroup.ownerId || undefined,
        ownerName: owner?.fullName || '',
        address: newGroup.address.trim(),
      });
      setNewGroup({ name: '', ownerId: '', address: '' });
      setIsCreating(false);
      setActionMsg({ type: 'success', text: '✅ Đã tạo NDD mới' });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleUpdate = async () => {
    if (!editingGroup) return;
    const gid = editingGroup.id || editingGroup._id;
    try {
      await Database.updateNutritionGroup(gid, {
        name: editingGroup.name,
        ownerId: editingGroup.ownerId,
        ownerName: editingGroup.ownerName,
        address: editingGroup.address,
        isActive: editingGroup.isActive,
      });
      setEditingGroup(null);
      setActionMsg({ type: 'success', text: '✅ Đã cập nhật NDD' });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleDelete = async (group: NutritionGroup) => {
    const gid = group.id || group._id;
    if (!confirm(`Xóa NDD "${group.name}"?`)) return;
    try {
      await Database.deleteNutritionGroup(gid);
      setActionMsg({ type: 'success', text: `🗑️ Đã xóa "${group.name}"` });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleApprove = async (groupId: string, userId: string, userName: string) => {
    try {
      await Database.approveNutritionGroupMember(groupId, userId);
      setActionMsg({ type: 'success', text: `✅ Đã duyệt ${userName}` });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleReject = async (groupId: string, userId: string) => {
    try {
      await Database.rejectNutritionGroupMember(groupId, userId);
      setActionMsg({ type: 'success', text: '✅ Đã từ chối yêu cầu' });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string, userName: string) => {
    if (!confirm(`Xóa ${userName} khỏi NDD?`)) return;
    try {
      await Database.removeNutritionGroupMember(groupId, userId);
      setActionMsg({ type: 'success', text: `✅ Đã xóa ${userName}` });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {actionMsg && (
        <div className={`px-6 py-4 rounded-2xl shadow-lg font-bold text-sm flex items-center justify-between ${
          actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="font-black text-slate-800 text-sm uppercase tracking-widest">🏥 Quản lý Nhóm Dinh Dưỡng (NDD)</h2>
        <button onClick={() => setIsCreating(true)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-bold text-xs hover:bg-emerald-700 transition-all">
          + Tạo NDD mới
        </button>
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="bg-white p-6 rounded-[2rem] border border-emerald-200 shadow-sm space-y-4">
          <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Thông tin NDD mới</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input placeholder="Tên NDD *" value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} className="px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
            <select value={newGroup.ownerId} onChange={e => setNewGroup({...newGroup, ownerId: e.target.value})} className="px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs">
              <option value="">-- Chọn chủ vận hành --</option>
              {users.filter(u => coachIds.includes(u.id || u._id)).map(u => {
                const uid = u.id || u._id;
                return <option key={uid} value={uid}>{u.fullName} (@{u.username})</option>;
              })}
            </select>
            <input placeholder="Địa chỉ" value={newGroup.address} onChange={e => setNewGroup({...newGroup, address: e.target.value})} className="px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsCreating(false)} className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
            <button onClick={handleCreate} className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[10px] shadow-lg">Tạo NDD</button>
          </div>
        </div>
      )}

      {/* Group List */}
      <div className="space-y-3">
        {groups.map(group => {
          const gid = group.id || group._id;
          const pendingCount = group.pendingMembers?.length || 0;

          return (
            <div key={gid} className="bg-white rounded-[2rem] border border-emerald-200 shadow-sm overflow-hidden hover:border-emerald-400 transition-all">
              <div className="px-5 py-4 border-b border-emerald-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-bold text-slate-800 text-sm truncate">{group.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${group.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {group.isActive ? 'Hoạt động' : 'Tạm dừng'}
                    </span>
                    {pendingCount > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[8px] font-black">
                        ⏳ {pendingCount} chờ duyệt
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 bg-emerald-50/30 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-medium">Chủ vận hành:</span>
                    <span className="ml-1 font-bold text-slate-700">{group.ownerName || 'Chưa có'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Địa chỉ:</span>
                    <span className="ml-1 font-bold text-slate-700">{group.address || 'Chưa có'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Hội viên:</span>
                    <span className="ml-1 font-bold text-emerald-600">{group.members?.length || 0} người</span>
                  </div>
                </div>

                {/* Pending members */}
                {viewPending?.id === gid && group.pendingMembers?.length > 0 && (
                  <div className="bg-amber-50 rounded-2xl p-4 space-y-2 border border-amber-200">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Yêu cầu chờ duyệt</p>
                    {group.pendingMembers.map((p: any, idx: number) => {
                      const userInfo = users.find(u => (u.id || u._id) === p.userId);
                      const userName = userInfo?.fullName || p.userName || 'Unknown';
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white rounded-xl p-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-600">
                              {userName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-700">{userName}</p>
                              <p className="text-[9px] text-slate-400">{new Date(p.requestedAt).toLocaleDateString('vi-VN')}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => handleApprove(gid, p.userId, userName)} className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-[9px] font-bold hover:bg-emerald-600">Duyệt</button>
                            <button onClick={() => handleReject(gid, p.userId)} className="px-3 py-1.5 bg-rose-100 text-rose-600 rounded-xl text-[9px] font-bold hover:bg-rose-200">Từ chối</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Member list */}
                {viewPending?.id === gid && group.members?.length > 0 && (
                  <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Danh sách hội viên</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {group.members.map((m: any, idx: number) => {
                        const uid = m._id || m;
                        const userInfo = users.find(u => (u.id || u._id) === uid);
                        const userName = userInfo?.fullName || 'Unknown';
                        return (
                          <div key={idx} className="flex items-center justify-between bg-white rounded-xl p-2">
                            <span className="text-xs font-medium text-slate-600">{userName}</span>
                            <button onClick={() => handleRemoveMember(gid, uid, userName)} className="text-[9px] font-bold text-rose-400 hover:text-rose-600">Xóa</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-emerald-100">
                  <button onClick={() => setViewPending(viewPending?.id === gid ? null : group)} className="flex-1 py-2 rounded-xl bg-amber-50 text-amber-600 font-black text-[9px] uppercase tracking-wider hover:bg-amber-100 transition-all">
                    👥 {pendingCount > 0 ? `${pendingCount} Chờ duyệt` : 'Hội viên'}
                  </button>
                  <button onClick={() => setEditingGroup({...group})} className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all">
                    ✏️ Sửa
                  </button>
                  <button onClick={() => handleDelete(group)} className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-600 font-black text-[9px] uppercase tracking-wider hover:bg-rose-100 transition-all">
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {groups.length === 0 && !isCreating && (
          <div className="p-16 text-center text-slate-300 italic uppercase text-[10px] font-black tracking-widest">
            Chưa có NDD nào. Hãy tạo NDD đầu tiên!
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
          <div className="bg-white w-full max-w-lg rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Chỉnh sửa NDD: {editingGroup.name}</h4>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên NDD</label>
                <input value={editingGroup.name} onChange={e => setEditingGroup({...editingGroup, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Chủ vận hành</label>
                <select value={editingGroup.ownerId} onChange={e => {
                  const owner = users.find(u => (u.id || u._id) === e.target.value);
                  setEditingGroup({...editingGroup, ownerId: e.target.value, ownerName: owner?.fullName || ''});
                }} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs mt-1">
                  {users.filter(u => coachIds.includes(u.id || u._id)).map(u => {
                    const uid = u.id || u._id;
                    return <option key={uid} value={uid} selected={uid === editingGroup.ownerId}>{u.fullName}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Địa chỉ</label>
                <input value={editingGroup.address} onChange={e => setEditingGroup({...editingGroup, address: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs mt-1" />
              </div>
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={editingGroup.isActive} onChange={() => setEditingGroup({...editingGroup, isActive: !editingGroup.isActive})} className="rounded" />
                <span className="text-xs font-bold text-slate-700">Đang hoạt động</span>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingGroup(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
              <button onClick={handleUpdate} className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[10px] shadow-lg">Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(NutritionGroupManager);