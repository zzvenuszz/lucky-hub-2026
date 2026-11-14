import { useBodyScrollLock, useModalStack } from '../../system/ModalManager.tsx';
import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { Database } from '../../../services/database.ts';

interface Group {
  _id: string;
  id: string;
  name: string;
  description: string;
  members: any[];
  permissions: string[];
  isActive: boolean;
  isDefault: boolean;
  allowMemberUpgrade?: boolean;
  priority?: number;
  isProtectedAdmin?: boolean;
  createdBy: string;
  createdAt: string;
}

const isGroupAdminProtected = (group: Partial<Group> | null | undefined): boolean => {
  if (!group) return false;
  if (group.isProtectedAdmin) return true;
  const nameLower = String(group.name || '').trim().toLowerCase();
  return (
    nameLower === 'administrator' ||
    nameLower === 'admin' ||
    nameLower === 'quản trị viên' ||
    Boolean((group.permissions || []).includes('admin:panel'))
  );
};

interface GroupManagerProps {
  users: any[];
  onRefresh: () => void;
}

// Nhóm permissions theo category
const PERMISSION_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  metrics: { label: 'Chỉ số', icon: '📊', color: 'text-emerald-600' },
  posts: { label: 'Bài viết', icon: '📝', color: 'text-blue-600' },
  chats: { label: 'Tin nhắn', icon: '💬', color: 'text-indigo-600' },
  users: { label: 'Người dùng', icon: '👥', color: 'text-amber-600' },
  ai: { label: 'AI', icon: '🤖', color: 'text-purple-600' },
  groups: { label: 'Nhóm', icon: '🔐', color: 'text-rose-600' },
  ndd: { label: 'Nhánh & NDD', icon: '🏥', color: 'text-emerald-600' },
  system: { label: 'Hệ thống', icon: '⚙️', color: 'text-slate-600' },
  admin: { label: 'Quản trị', icon: '🛡️', color: 'text-red-600' },
};

const getCategory = (key: string): string => {
  const prefix = key.split(':')[0];
  return prefix;
};

const GroupManager: React.FC<GroupManagerProps> = ({ users, onRefresh }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [permissionsList, setPermissionsList] = useState<{ key: string; description: string }[]>([]);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [modalMode, setModalMode] = useState<'edit' | 'members'>('edit');
  const [isCreating, setIsCreating] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', permissions: [] as string[], isDefault: false, allowMemberUpgrade: false, priority: 1 });
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const closeModal = useCallback(() => {
    setEditingGroup(null);
    setSelectedMembers([]);
    setModalMode('edit');
  }, []);
  const editModalId = React.useMemo(() => `group-edit_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(!!editingGroup);
  useModalStack(editModalId, closeModal);

  // Nhóm permissions theo category
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, { key: string; description: string }[]> = {};
    permissionsList.forEach(p => {
      const cat = getCategory(p.key);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    // Sắp xếp theo thứ tự category
    const order = Object.keys(PERMISSION_CATEGORIES);
    return Object.entries(groups).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  }, [permissionsList]);

  const loadData = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([
        Database.getGroups(),
        Database.getGroupPermissionsList()
      ]);
      setGroups(g || []);
      setPermissionsList(p || []);
    } catch (err: any) {
      console.error('[GroupManager] Load error:', err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) {
      setActionMessage({ type: 'error', text: '❌ Tên nhóm là bắt buộc' });
      return;
    }
    try {
      await Database.createGroup({
        ...newGroup,
        priority: Math.max(0, Number(newGroup.priority) || 1),
      });
      setNewGroup({ name: '', description: '', permissions: [], isDefault: false, allowMemberUpgrade: false, priority: 1 });
      setIsCreating(false);
      setActionMessage({ type: 'success', text: '✅ Đã tạo nhóm mới' });
      loadData();
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    const gid = editingGroup.id || editingGroup._id;
    const isProtected = isGroupAdminProtected(editingGroup);
    try {
      await Database.updateGroup(gid, {
        name: editingGroup.name,
        description: editingGroup.description,
        permissions: editingGroup.permissions,
        isActive: isProtected ? true : editingGroup.isActive,
        isDefault: editingGroup.isDefault,
        allowMemberUpgrade: Boolean(editingGroup.allowMemberUpgrade),
        priority: isProtected ? 0 : Math.max(0, Number(editingGroup.priority ?? 10)),
      });
      closeModal();
      setActionMessage({ type: 'success', text: '✅ Đã cập nhật nhóm' });
      loadData();
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleToggleAllowUpgrade = useCallback(async (group: Group) => {
    const gid = group.id || group._id;
    const nextValue = !group.allowMemberUpgrade;
    console.log('[GroupManager] Toggle allowMemberUpgrade:', { groupId: gid, groupName: group.name, allowMemberUpgrade: nextValue });
    try {
      await Database.updateGroup(gid, { allowMemberUpgrade: nextValue });
      setGroups(prev => prev.map(g => (g.id || g._id) === gid ? { ...g, allowMemberUpgrade: nextValue } : g));
      setActionMessage({
        type: 'success',
        text: `✅ Đã ${nextValue ? 'bật' : 'tắt'} cho phép nâng cấp thành viên vào nhóm "${group.name}"`,
      });
    } catch (err: any) {
      console.error('[GroupManager] Toggle allowMemberUpgrade error:', err);
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  }, []);

  const handleChangeGroupPriority = useCallback(async (group: Group, rawPriority: string) => {
    if (isGroupAdminProtected(group)) return;
    const parsed = Number(rawPriority);
    if (!Number.isInteger(parsed) || parsed < 0) return;
    const gid = group.id || group._id;
    console.log('[GroupManager] Update group priority:', { groupId: gid, groupName: group.name, priority: parsed });
    try {
      await Database.updateGroup(gid, { priority: parsed });
      setGroups(prev => prev.map(g => (g.id || g._id) === gid ? { ...g, priority: parsed } : g));
      setActionMessage({ type: 'success', text: `✅ Đã đặt Priority ${parsed} cho nhóm "${group.name}"` });
    } catch (err: any) {
      console.error('[GroupManager] Update priority error:', err);
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  }, []);

  const handleDeleteGroup = async (group: Group) => {
    if (isGroupAdminProtected(group)) {
      setActionMessage({ type: 'error', text: '❌ Nhóm Administrator được bảo vệ, không thể xóa.' });
      return;
    }
    const gid = group.id || group._id;
    if (!confirm(`Bạn có chắc muốn xóa nhóm "${group.name}"?`)) return;
    try {
      await Database.deleteGroup(gid);
      setActionMessage({ type: 'success', text: `🗑️ Đã xóa nhóm "${group.name}"` });
      loadData();
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleUpdateMembers = async (group: Group) => {
    const gid = group.id || group._id;
    try {
      await Database.updateGroupMembers(gid, selectedMembers);
      closeModal();
      setActionMessage({ type: 'success', text: '✅ Đã cập nhật thành viên' });
      loadData();
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const openMemberEditor = (group: Group) => {
    setModalMode('members');
    setEditingGroup({ ...group });
    setSelectedMembers(group.members?.filter(Boolean).map((m: any) => String(m._id || m)) || []);
  };

  const openGroupEditor = (group: Group) => {
    setModalMode('edit');
    setSelectedMembers([]);
    setEditingGroup({ ...group });
  };

  const togglePermission = (perm: string) => {
    if (!editingGroup) return;
    if (isGroupAdminProtected(editingGroup) && (perm === 'admin:panel' || perm === 'users:upgrade_member')) {
      return;
    }
    const current = editingGroup.permissions || [];
    const updated = current.includes(perm)
      ? current.filter(p => p !== perm)
      : [...current, perm];
    setEditingGroup({ ...editingGroup, permissions: updated });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {actionMessage && (
        <div className={`px-6 py-4 rounded-2xl shadow-lg font-bold text-sm ${actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {actionMessage.text}
          <button onClick={() => setActionMessage(null)} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="font-black text-slate-800 text-sm uppercase tracking-widest">Quản lý nhóm & phân quyền</h2>
        <button onClick={() => setIsCreating(true)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-bold text-xs hover:bg-emerald-700 transition-all">
          + Tạo nhóm mới
        </button>
      </div>

      {/* Create Group Form */}
      {isCreating && (
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
          <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Thông tin nhóm mới</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input 
              placeholder="Tên nhóm *" 
              value={newGroup.name} 
              onChange={e => setNewGroup({...newGroup, name: e.target.value})}
              className="px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs"
            />
            <input 
              placeholder="Mô tả (không bắt buộc)" 
              value={newGroup.description} 
              onChange={e => setNewGroup({...newGroup, description: e.target.value})}
              className="px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs"
            />
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2">
              <span className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">Priority:</span>
              <input
                type="number"
                min="1"
                step="1"
                value={newGroup.priority}
                onChange={e => setNewGroup({ ...newGroup, priority: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                className="w-full bg-white px-3 py-1.5 rounded-lg outline-none font-black text-xs text-slate-800 border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Allow Member Upgrade toggle */}
            <label className="flex items-center justify-between gap-3 p-4 bg-emerald-50/60 rounded-xl cursor-pointer border border-emerald-100">
              <div>
                <span className="text-xs font-bold text-slate-700">⬆️ Cho phép nâng cấp hội viên thành nhóm này</span>
                <p className="text-[9px] text-slate-400 mt-0.5">Hiện trong danh sách nhóm khi nâng cấp hội viên tại NDD</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={newGroup.allowMemberUpgrade}
                onClick={() => setNewGroup({ ...newGroup, allowMemberUpgrade: !newGroup.allowMemberUpgrade })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${newGroup.allowMemberUpgrade ? 'bg-emerald-600' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${newGroup.allowMemberUpgrade ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </label>

            {/* Default toggle */}
            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer border border-slate-100">
              <input 
                type="checkbox" 
                checked={newGroup.isDefault}
                onChange={() => setNewGroup({...newGroup, isDefault: !newGroup.isDefault})}
                className="rounded"
              />
              <div>
                <span className="text-xs font-bold text-slate-700">⭐ Nhóm mặc định</span>
                <p className="text-[9px] text-slate-400 mt-0.5">Hội viên mới sẽ tự động được thêm vào nhóm này</p>
              </div>
            </label>
          </div>
          
          {/* Permissions cho nhóm mới */}
          <div>
            <h4 className="font-black text-[10px] text-slate-400 uppercase tracking-widest mb-3">Phân quyền cho nhóm</h4>
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {groupedPermissions.map(([cat, perms]) => {
                const catInfo = PERMISSION_CATEGORIES[cat] || { label: cat, icon: '📦', color: 'text-slate-600' };
                return (
                  <div key={cat} className="bg-slate-50/50 rounded-2xl p-3 border border-slate-100">
                    <h5 className={`font-black text-[10px] uppercase tracking-wider mb-2 flex items-center gap-2 ${catInfo.color}`}>
                      <span>{catInfo.icon}</span> {catInfo.label}
                      <span className="text-slate-300 font-medium ml-auto">({perms.length})</span>
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {perms.map(p => (
                        <label key={p.key} className="flex items-center gap-2 p-2 rounded-xl bg-white hover:bg-slate-50 cursor-pointer text-[11px] border border-transparent hover:border-slate-200 transition-all">
                          <input 
                            type="checkbox" 
                            checked={newGroup.permissions.includes(p.key)}
                            onChange={() => {
                              const updated = newGroup.permissions.includes(p.key)
                                ? newGroup.permissions.filter(pp => pp !== p.key)
                                : [...newGroup.permissions, p.key];
                              setNewGroup({...newGroup, permissions: updated});
                            }}
                            className="rounded"
                          />
                          <span className="font-medium text-slate-700">{p.description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setIsCreating(false)} className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
            <button onClick={handleCreateGroup} className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[10px] shadow-lg">Tạo nhóm</button>
          </div>
        </div>
      )}

      {/* Group List - Cards with orange border */}
      <div className="space-y-3">
        {groups.map(group => {
          const gid = group.id || group._id;
          const isProtected = isGroupAdminProtected(group);
          const groupPriority = isProtected ? 0 : (typeof group.priority === 'number' ? group.priority : 10);
          return (
            <div key={gid} data-testid={`admin-group-card-${gid}`} className="bg-white rounded-[2rem] border border-orange-200 shadow-sm overflow-hidden hover:border-orange-400 transition-all">
              {/* Header: Công tắc cho phép nâng cấp + Priority + Tên nhóm + trạng thái */}
              <div className="bg-white px-5 py-4 border-b border-orange-100 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-orange-50">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(group.allowMemberUpgrade)}
                      aria-label={`Cho phép nâng cấp hội viên thành nhóm ${group.name}`}
                      data-testid={`group-upgrade-toggle-${gid}`}
                      disabled={isProtected}
                      onClick={() => handleToggleAllowUpgrade(group)}
                      className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors ${
                        group.allowMemberUpgrade ? 'bg-emerald-600' : 'bg-slate-300'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      title={isProtected ? 'Nhóm Administrator không cho phép nâng cấp từ NDD' : 'Bật/tắt cho phép nâng cấp hội viên thành nhóm này'}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          group.allowMemberUpgrade ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-[10px] font-bold text-slate-600">
                      Cho phép nâng cấp hội viên
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-slate-500 uppercase">Priority:</span>
                    <input
                      type="number"
                      min={isProtected ? 0 : 1}
                      step="1"
                      disabled={isProtected}
                      data-testid={`group-priority-input-${gid}`}
                      value={groupPriority}
                      onChange={e => handleChangeGroupPriority(group, e.target.value)}
                      className="w-16 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-center font-black text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      title={isProtected ? 'Nhóm Administrator mặc định có Priority 0 và không thay đổi được' : 'Số càng thấp quyền hạn càng cao (0, 1, 2, 3...)'}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-bold text-slate-800 text-sm truncate">{group.name}</h3>
                    {isProtected && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0" data-testid={`group-protected-badge-${gid}`}>
                        🛡️ Bảo vệ · Priority 0
                      </span>
                    )}
                    {group.isDefault && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                        ⭐ Mặc định
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase shrink-0 ml-2 ${group.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {group.isActive ? 'Hoạt động' : 'Tạm dừng'}
                  </span>
                </div>
              </div>
              {/* Body: Chi tiết + actions */}
              <div className="bg-orange-50/30 px-5 py-4 space-y-3">
                <p className="text-[10px] text-slate-400">{group.description || 'Không có mô tả'}</p>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-slate-400 font-medium">
                    👥 {group.members?.length || 0} thành viên
                  </span>
                </div>
                {/* Permissions badges */}
                <div className="flex flex-wrap gap-1.5">
                  {(group.permissions || []).map(p => {
                    const desc = permissionsList.find(pl => pl.key === p);
                    return (
                      <span key={p} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-black uppercase">
                        {desc?.description || p.split(':').pop()}
                      </span>
                    );
                  })}
                </div>
                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-orange-100">
                  <button onClick={() => openMemberEditor(group)} className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-600 font-black text-[9px] uppercase tracking-wider hover:bg-blue-100 transition-all">👥 Thành viên</button>
                  <button onClick={() => openGroupEditor(group)} data-testid={`group-edit-btn-${gid}`} className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all">✏️ Sửa</button>
                  {!isProtected && (
                    <button onClick={() => handleDeleteGroup(group)} className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-600 font-black text-[9px] uppercase tracking-wider hover:bg-rose-100 transition-all">🗑️ Xóa</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {groups.length === 0 && !isCreating && (
          <div className="p-10 text-center text-slate-300 italic uppercase text-[10px] font-black tracking-widest">Chưa có nhóm nào. Hãy tạo nhóm đầu tiên!</div>
        )}
      </div>

      {/* Edit Group Modal */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white w-full max-w-2xl max-h-[calc(100dvh-24px)] overflow-y-auto overflow-x-hidden rounded-[2rem] md:rounded-[2.5rem] p-4 md:p-8 space-y-6 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">
              {modalMode === 'members' ? 'Quản lý thành viên' : 'Chỉnh sửa nhóm'}: {editingGroup.name}
            </h4>

            {/* Member Management */}
            {modalMode === 'members' ? (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-400 font-medium">Chọn thành viên cho nhóm này</p>
                <div className="max-h-[400px] overflow-y-auto space-y-1">
                  {users.map(u => {
                    const uid = (u as any).id || (u as any)._id;
                    const isSelected = selectedMembers.includes(uid);
                    return (
                      <label key={uid} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-slate-50'}`}>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => {
                            setSelectedMembers(prev =>
                              prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
                            );
                          }}
                          className="rounded"
                        />
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs">
                          {u.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-800">{u.fullName}</div>
                          <div className="text-[9px] text-slate-400">@{u.username}</div>
                        </div>
                        
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={closeModal} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
                  <button onClick={() => handleUpdateMembers(editingGroup)} className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-black uppercase text-[11px] shadow-lg">Lưu thành viên</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {isGroupAdminProtected(editingGroup) && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700" data-testid="admin-group-protection-notice">
                    🛡️ Nhóm Administrator được hệ thống bảo vệ: không thể đổi tên, cố định Priority = 0 và mặc định có quyền Nâng cấp thành viên.
                  </div>
                )}
                {/* Group Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên nhóm</label>
                    <input
                      data-testid="edit-group-name-input"
                      disabled={isGroupAdminProtected(editingGroup)}
                      value={editingGroup.name}
                      onChange={e => setEditingGroup({...editingGroup, name: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mô tả</label>
                    <input value={editingGroup.description} onChange={e => setEditingGroup({...editingGroup, description: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Priority (0, 1, 2...)</label>
                    <input
                      type="number"
                      min={isGroupAdminProtected(editingGroup) ? 0 : 1}
                      step="1"
                      disabled={isGroupAdminProtected(editingGroup)}
                      data-testid="edit-group-priority-input"
                      value={isGroupAdminProtected(editingGroup) ? 0 : (editingGroup.priority ?? 10)}
                      onChange={e => setEditingGroup({ ...editingGroup, priority: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                      className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Allow Member Upgrade toggle in Edit Modal */}
                <label className="flex items-center justify-between gap-3 p-4 bg-emerald-50/60 rounded-xl cursor-pointer border border-emerald-100">
                  <div>
                    <span className="text-xs font-bold text-slate-700">⬆️ Cho phép nâng cấp hội viên thành nhóm này</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">Bật công tắc để hiển thị nhóm này trong tùy chọn nâng cấp hội viên tại NDD</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(editingGroup.allowMemberUpgrade)}
                    disabled={isGroupAdminProtected(editingGroup)}
                    data-testid="edit-group-upgrade-switch"
                    onClick={() => setEditingGroup({ ...editingGroup, allowMemberUpgrade: !editingGroup.allowMemberUpgrade })}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${editingGroup.allowMemberUpgrade ? 'bg-emerald-600' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editingGroup.allowMemberUpgrade ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </label>

                {/* Default toggle */}
                <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer border border-slate-100">
                  <input 
                    type="checkbox" 
                    checked={editingGroup.isDefault || false}
                    onChange={() => setEditingGroup({...editingGroup, isDefault: !editingGroup.isDefault})}
                    className="rounded"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-700">⭐ Nhóm mặc định</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">Hội viên mới sẽ tự động được thêm vào nhóm này</p>
                  </div>
                </label>

                {/* Permissions - grouped by category */}
                <div>
                  <h4 className="font-black text-[10px] text-slate-400 uppercase tracking-widest mb-3">Phân quyền</h4>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {groupedPermissions.map(([cat, perms]) => {
                      const catInfo = PERMISSION_CATEGORIES[cat] || { label: cat, icon: '📦', color: 'text-slate-600' };
                      return (
                        <div key={cat} className="bg-slate-50/50 rounded-2xl p-3 border border-slate-100">
                          <h5 className={`font-black text-[10px] uppercase tracking-wider mb-2 flex items-center gap-2 ${catInfo.color}`}>
                            <span>{catInfo.icon}</span> {catInfo.label}
                            <span className="text-slate-300 font-medium ml-auto">({perms.length})</span>
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                            {perms.map(p => (
                              <label key={p.key} className="flex items-center gap-2 p-2 rounded-xl bg-white hover:bg-slate-50 cursor-pointer text-[11px] border border-transparent hover:border-slate-200 transition-all">
                                <input 
                                  type="checkbox" 
                                  checked={(editingGroup.permissions || []).includes(p.key)}
                                  onChange={() => togglePermission(p.key)}
                                  className="rounded"
                                />
                                <span className="font-medium text-slate-700">{p.description}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Active toggle */}
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={editingGroup.isActive}
                    onChange={() => setEditingGroup({...editingGroup, isActive: !editingGroup.isActive})}
                    className="rounded"
                  />
                  <span className="text-xs font-bold text-slate-700">Nhóm đang hoạt động</span>
                </label>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => { setEditingGroup(null); setSelectedMembers([]); }} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
                  <button onClick={handleUpdateGroup} className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg">Lưu thay đổi</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(GroupManager);
