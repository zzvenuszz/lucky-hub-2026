import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Database } from '../../../services/database.ts';
import { useBodyScrollLock, useModalStack } from '../../system/ModalManager.tsx';

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

  const editModalId = useMemo(() => `nutrition-edit_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(!!editingGroup);
  useModalStack(editModalId, () => setEditingGroup(null));

  const loadGroups = useCallback(async () => {
    try {
      const data = await Database.getAllNutritionGroups();
      setGroups(data || []);
    } catch (err: any) {
      console.error('[NutritionGroupManager] Load error:', err);
    }
  }, []);

  const loadCoachIds = useCallback(async () => {
    try {
      const allGroups = await Database.getGroups();
      const coachGroups = allGroups.filter((g: any) => (g.permissions || []).includes('coach:access'));
      const memberIds: string[] = [];
      const seen = new Set<string>();
      for (const g of coachGroups) {
        for (const m of (g.members || [])) {
          const id = String(m._id || m);
          if (!seen.has(id)) {
            seen.add(id);
            memberIds.push(id);
          }
        }
      }
      console.log(`[NutritionGroupManager] Found ${memberIds.length} users with coach:access from ${coachGroups.length} groups`);
      setCoachIds(memberIds);
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
      const owner = users.find(u => String(u.id || u._id) === newGroup.ownerId);
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
        <button onClick={() => setIsCreating(true)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-bold text-xs hover:bg-emerald-700 transition-all">+ Tạo NDD mới</button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-[2rem] border border-emerald-200 shadow-sm space-y-4">
          <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Thông tin NDD mới</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input placeholder="Tên NDD *" value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} className="px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
            <select value={newGroup.ownerId} onChange={e => setNewGroup({...newGroup, ownerId: e.target.value})} className="px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs">
              <option value="">-- Chọn chủ vận hành --</option>
              {users.filter(u => coachIds.includes(String(u.id || u._id))).map(u => {
                const uid = String(u.id || u._id);
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

      <div className="space-y-3">
        {groups.map(group => {
          const gid = group.id || group._id;
          const pendingCount = group.pendingMembers?.length || 0;
          return (
            <div key={gid} className="bg-white rounded-[2rem] border border-emerald-200 shadow-sm overflow-hidden hover:border-emerald-400 transition-all">
              <div className="px-5 py-4 border-b border-emerald-100">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm truncate">{group.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${group.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {group.isActive ? 'Hoạt động' : 'Tạm dừng'}
                  </span>
                  {pendingCount > 0 && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[8px] font-black">⏳ {pendingCount} chờ duyệt</span>}
                </div>
              </div>
              <div className="px-5 py-4 bg-emerald-50/30 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-[11px]">
                  <div><span className="text-slate-400 font-medium">Chủ vận hành:</span><span className="ml-1 font-bold text-slate-700">{group.ownerName || 'Chưa có'}</span></div>
                  <div><span className="text-slate-400 font-medium">Địa chỉ:</span><span className="ml-1 font-bold text-slate-700">{group.address || 'Chưa có'}</span></div>
                  <div><span className="text-slate-400 font-medium">Hội viên:</span><span className="ml-1 font-bold text-emerald-600">{group.members?.length || 0} người</span></div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-emerald-100">
                  <button onClick={() => setViewPending(viewPending?.id === gid ? null : group)} className="flex-1 py-2 rounded-xl bg-amber-50 text-amber-600 font-black text-[9px] uppercase tracking-wider hover:bg-amber-100 transition-all">
                    👥 {pendingCount > 0 ? `${pendingCount} Chờ duyệt` : 'Hội viên'}
                  </button>
                  <button onClick={() => setEditingGroup({...group})} className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all">✏️ Sửa</button>
                  <button onClick={() => handleDelete(group)} className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-600 font-black text-[9px] uppercase tracking-wider hover:bg-rose-100 transition-all">🗑️ Xóa</button>
                </div>
              </div>
            </div>
          );
        })}
        {groups.length === 0 && !isCreating && (
          <div className="p-16 text-center text-slate-300 italic uppercase text-[10px] font-black tracking-widest">Chưa có NDD nào. Hãy tạo NDD đầu tiên!</div>
        )}
      </div>

      {editingGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4" onClick={e => e.stopPropagation()}>
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
                  const owner = users.find(u => String(u.id || u._id) === e.target.value);
                  setEditingGroup({...editingGroup, ownerId: e.target.value, ownerName: owner?.fullName || ''});
                }} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs mt-1">
                  {users.filter(u => coachIds.includes(String(u.id || u._id))).map(u => {
                    const uid = String(u.id || u._id);
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

      {/* View Members / Pending Modal */}
      {viewPending && <ViewMembersModal group={viewPending} users={users} onApprove={handleApprove} onReject={handleReject} onRemoveMember={handleRemoveMember} onClose={() => setViewPending(null)} />}
    </div>
  );
};

// ─── View Members Modal ─────────────────────────────────────────
interface ViewMembersModalProps {
  group: NutritionGroup;
  users: any[];
  onApprove: (groupId: string, userId: string, userName: string) => void;
  onReject: (groupId: string, userId: string) => void;
  onRemoveMember: (groupId: string, userId: string, userName: string) => void;
  onClose: () => void;
}

const ViewMembersModal: React.FC<ViewMembersModalProps> = memo(({
  group,
  users,
  onApprove,
  onReject,
  onRemoveMember,
  onClose,
}) => {
  const modalId = useMemo(() => `view-members_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(modalId, onClose);

  const gid = group.id || group._id;
  const pendingCount = group.pendingMembers?.length || 0;

  // Map member IDs to user objects
  const memberUsers = useMemo(() => {
    const memberIds = (group.members || []).map((m: any) => m._id || m);
    return users.filter((u: any) => memberIds.includes(String(u.id || u._id)));
  }, [group.members, users]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-black text-lg">👥 {group.name}</h2>
              <p className="text-emerald-100 text-xs font-medium mt-0.5">{memberUsers.length} hội viên {pendingCount > 0 ? `· ${pendingCount} chờ duyệt` : ''}</p>
            </div>
            <button onClick={onClose} className="text-white text-xl hover:scale-110 transition-all font-bold">✕</button>
          </div>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto no-scrollbar flex-1 space-y-6">
          {/* Pending Members Section */}
          {pendingCount > 0 && (
            <div>
              <h4 className="font-black text-amber-600 text-xs uppercase tracking-widest mb-3">⏳ Chờ duyệt ({pendingCount})</h4>
              <div className="space-y-2">
                {group.pendingMembers!.map((pm: any, idx: number) => {
                  const user = pm.userId || pm;
                  const uid = user._id || user.id || (typeof user === 'string' ? user : '');
                  const fullName = user.fullName || (typeof user === 'string' ? 'Không có tên' : 'Không có tên');
                  const username = user.username || '';
                  const avatar = user.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${fullName}`;
                  return (
                    <div key={uid || idx} className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                      <img src={avatar} className="w-9 h-9 rounded-xl object-cover shrink-0" alt={fullName} />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm text-slate-800 truncate block">{fullName}</span>
                        <p className="text-[10px] text-slate-400">@{username}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => onApprove(gid, uid, fullName)} className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-emerald-600 transition-all">Duyệt</button>
                        <button onClick={() => onReject(gid, uid)} className="px-3 py-2 bg-rose-400 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-rose-500 transition-all">Từ chối</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Members Section */}
          <div>
            <h4 className="font-black text-slate-600 text-xs uppercase tracking-widest mb-3">✅ Hội viên ({memberUsers.length})</h4>
            {memberUsers.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs font-medium italic">Chưa có hội viên nào</div>
            ) : (
              <div className="space-y-2">
                {memberUsers.map((u: any) => {
                  const uid = String(u.id || u._id);
                  return (
                    <div key={uid} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <img src={u.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.fullName}`} className="w-9 h-9 rounded-xl object-cover shrink-0" alt={u.fullName} />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm text-slate-800 truncate block">{u.fullName}</span>
                        <p className="text-[10px] text-slate-400">@{u.username} · {u.email || ''}</p>
                      </div>
                      <button onClick={() => onRemoveMember(gid, uid, u.fullName)} className="px-3 py-2 bg-rose-50 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-rose-100 transition-all shrink-0">🗑️ Xóa</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px] hover:bg-slate-200 transition-all">Đóng</button>
        </div>
      </div>
    </div>
  );
});

ViewMembersModal.displayName = 'ViewMembersModal';

export default memo(NutritionGroupManager);
