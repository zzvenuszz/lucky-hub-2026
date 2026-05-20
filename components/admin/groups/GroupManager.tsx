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
  createdBy: string;
  createdAt: string;
}

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
  const [isCreating, setIsCreating] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', permissions: [] as string[], isDefault: false });
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      await Database.createGroup(newGroup);
      setNewGroup({ name: '', description: '', permissions: [], isDefault: false });
      setIsCreating(false);
      setActionMessage({ type: 'success', text: '✅ Đã tạo nhóm mới' });
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    const gid = editingGroup.id || editingGroup._id;
    try {
      await Database.updateGroup(gid, {
        name: editingGroup.name,
        description: editingGroup.description,
        permissions: editingGroup.permissions,
        isActive: editingGroup.isActive,
        isDefault: editingGroup.isDefault,
      });
      setEditingGroup(null);
      setActionMessage({ type: 'success', text: '✅ Đã cập nhật nhóm' });
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    const gid = group.id || group._id;
    if (!confirm(`Bạn có chắc muốn xóa nhóm "${group.name}"?`)) return;
    try {
      await Database.deleteGroup(gid);
      setActionMessage({ type: 'success', text: `🗑️ Đã xóa nhóm "${group.name}"` });
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleUpdateMembers = async (group: Group) => {
    const gid = group.id || group._id;
    try {
      await Database.updateGroupMembers(gid, selectedMembers);
      setEditingGroup(null);
      setActionMessage({ type: 'success', text: '✅ Đã cập nhật thành viên' });
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const openMemberEditor = (group: Group) => {
    setEditingGroup({ ...group });
    setSelectedMembers(group.members?.map((m: any) => m._id || m) || []);
  };

  const togglePermission = (perm: string) => {
    if (!editingGroup) return;
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
          <div className="grid grid-cols-2 gap-4">
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
          </div>

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

      {/* Group List */}
      <div className="space-y-4">
        {groups.map(group => {
          const gid = group.id || group._id;
          return (
            <div key={gid} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    {group.name}
                    {group.isDefault && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                        ⭐ Mặc định
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">{group.description || 'Không có mô tả'}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[9px] text-slate-400 font-medium">
                      👥 {group.members?.length || 0} thành viên
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${group.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {group.isActive ? 'Hoạt động' : 'Tạm dừng'}
                    </span>
                  </div>
                  {/* Permissions badges */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(group.permissions || []).map(p => {
                      const desc = permissionsList.find(pl => pl.key === p);
                      return (
                        <span key={p} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-black uppercase">
                          {desc?.description || p.split(':').pop()}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openMemberEditor(group)} className="text-blue-600 font-black text-[9px] hover:underline uppercase">Thành viên</button>
                  <button onClick={() => setEditingGroup({...group})} className="text-emerald-600 font-black text-[9px] hover:underline uppercase">Sửa</button>
                  <button onClick={() => handleDeleteGroup(group)} className="text-rose-600 font-black text-[9px] hover:underline uppercase">Xóa</button>
                </div>
              </div>
            </div>
          );
        })}
        {groups.length === 0 && !isCreating && (
          <div className="p-20 text-center text-slate-300 italic uppercase text-[10px] font-black tracking-widest">Chưa có nhóm nào. Hãy tạo nhóm đầu tiên!</div>
        )}
      </div>

      {/* Edit Group Modal */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 my-8">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">
              {selectedMembers.length > 0 ? 'Quản lý thành viên' : 'Chỉnh sửa nhóm'}: {editingGroup.name}
            </h4>

            {/* Member Management */}
            {selectedMembers.length > 0 ? (
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
                        <span className="ml-auto text-[8px] font-black uppercase text-slate-400">{u.role}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => { setEditingGroup(null); setSelectedMembers([]); }} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
                  <button onClick={() => handleUpdateMembers(editingGroup)} className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-black uppercase text-[11px] shadow-lg">Lưu thành viên</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên nhóm</label>
                    <input value={editingGroup.name} onChange={e => setEditingGroup({...editingGroup, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mô tả</label>
                    <input value={editingGroup.description} onChange={e => setEditingGroup({...editingGroup, description: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
                  </div>
                </div>

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