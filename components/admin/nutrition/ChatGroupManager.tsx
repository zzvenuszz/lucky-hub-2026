import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Database } from '../../../services/database.ts';
import { useBodyScrollLock, useModalStack } from '../../system/ModalManager.tsx';

interface ChatGroup {
  _id: string;
  id: string;
  name: string;
  nutritionGroupIds: string[];
  memberIds: string[];
  createdBy: string;
  isActive: boolean;
  messages: any[];
  lastMessage?: { content: string; senderName: string; timestamp: string };
}

interface ChatGroupManagerProps {
  users: any[];
  nutritionGroups: any[];
  onRefresh: () => void;
}

const ChatGroupManager: React.FC<ChatGroupManagerProps> = ({ users, nutritionGroups, onRefresh }) => {
  const editModalId = useMemo(() => `chatgroup-edit_${Math.random().toString(36).slice(2, 9)}`, []);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChatGroup | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newGroup, setNewGroup] = useState({ name: '', nutritionGroupIds: [] as string[], memberIds: [] as string[] });

  useBodyScrollLock(!!editingGroup);
  useModalStack(editModalId, () => setEditingGroup(null));

  const loadGroups = useCallback(async () => {
    try {
      const data = await Database.getAllChatGroups();
      setGroups(data || []);
    } catch (err: any) {
      console.error('[ChatGroupManager] Load error:', err);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleNutritionGroupToggle = (ngId: string) => {
    const isSelected = newGroup.nutritionGroupIds.includes(ngId);
    let updatedNgIds: string[];
    let updatedMemberIds = [...newGroup.memberIds];

    if (isSelected) {
      updatedNgIds = newGroup.nutritionGroupIds.filter(id => id !== ngId);
      const ng = nutritionGroups.find(g => (g.id || g._id) === ngId);
      if (ng?.members) {
        const memberIds = ng.members.map((m: any) => m._id || m);
        updatedMemberIds = updatedMemberIds.filter(id => !memberIds.includes(id));
      }
    } else {
      updatedNgIds = [...newGroup.nutritionGroupIds, ngId];
      const ng = nutritionGroups.find(g => (g.id || g._id) === ngId);
      if (ng?.members) {
        const memberIds = ng.members.map((m: any) => m._id || m);
        memberIds.forEach((id: string) => {
          if (!updatedMemberIds.includes(id)) updatedMemberIds.push(id);
        });
      }
    }
    setNewGroup({ ...newGroup, nutritionGroupIds: updatedNgIds, memberIds: updatedMemberIds });
  };

  const handleCreate = async () => {
    if (!newGroup.name.trim()) {
      setActionMsg({ type: 'error', text: '❌ Tên group là bắt buộc' });
      return;
    }
    try {
      await Database.createChatGroup({
        name: newGroup.name.trim(),
        nutritionGroupIds: newGroup.nutritionGroupIds,
        memberIds: newGroup.memberIds,
      });
      setNewGroup({ name: '', nutritionGroupIds: [], memberIds: [] });
      setIsCreating(false);
      setActionMsg({ type: 'success', text: '✅ Đã tạo group chat mới' });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleUpdate = async () => {
    if (!editingGroup) return;
    const gid = editingGroup.id || editingGroup._id;
    try {
      await Database.updateChatGroup(gid, {
        name: editingGroup.name,
        nutritionGroupIds: editingGroup.nutritionGroupIds,
        memberIds: editingGroup.memberIds,
        isActive: editingGroup.isActive,
      });
      setEditingGroup(null);
      setActionMsg({ type: 'success', text: '✅ Đã cập nhật group chat' });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleDelete = async (group: ChatGroup) => {
    const gid = group.id || group._id;
    if (!confirm(`Xóa group "${group.name}"?`)) return;
    try {
      await Database.deleteChatGroup(gid);
      setActionMsg({ type: 'success', text: `🗑️ Đã xóa "${group.name}"` });
      loadGroups();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const getNutritionGroupNames = (ids: string[]) => {
    return ids.map(id => {
      const ng = nutritionGroups.find(g => (g.id || g._id) === id);
      return ng?.name || 'Unknown';
    }).join(', ');
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
        <h2 className="font-black text-slate-800 text-sm uppercase tracking-widest">👥 Quản lý Group Chat</h2>
        <button onClick={() => setIsCreating(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-bold text-xs hover:bg-indigo-700 transition-all">+ Tạo Group mới</button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-[2rem] border border-indigo-200 shadow-sm space-y-4">
          <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Thông tin Group Chat mới</h3>
          <input placeholder="Tên Group *" value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Chọn NDD tham gia</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {nutritionGroups.map(ng => {
                const ngId = ng.id || ng._id;
                const isSelected = newGroup.nutritionGroupIds.includes(ngId);
                return (
                  <label key={ngId} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs">
                    <input type="checkbox" checked={isSelected} onChange={() => handleNutritionGroupToggle(ngId)} className="rounded" />
                    <span className="font-bold text-slate-700">{ng.name}</span>
                    <span className="text-[9px] text-slate-400">({ng.members?.length || 0} hội viên)</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsCreating(false)} className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
            <button onClick={handleCreate} className="px-6 py-3 rounded-2xl bg-indigo-600 text-white font-black uppercase text-[10px] shadow-lg">Tạo Group</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {groups.map(group => {
          const gid = group.id || group._id;
          return (
            <div key={gid} className="bg-white rounded-[2rem] border border-indigo-200 shadow-sm overflow-hidden hover:border-indigo-400 transition-all">
              <div className="px-5 py-4 border-b border-indigo-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-sm">{group.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${group.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{group.isActive ? 'Hoạt động' : 'Tạm dừng'}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{group.memberIds?.length || 0} thành viên</span>
              </div>
              <div className="px-5 py-4 bg-indigo-50/30 space-y-2">
                <div className="flex gap-2 pt-2 border-t border-indigo-100">
                  <button onClick={() => setEditingGroup({...group})} className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all">✏️ Sửa</button>
                  <button onClick={() => handleDelete(group)} className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-600 font-black text-[9px] uppercase tracking-wider hover:bg-rose-100 transition-all">🗑️ Xóa</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white w-full max-w-lg rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Chỉnh sửa Group: {editingGroup.name}</h4>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên Group</label>
              <input value={editingGroup.name} onChange={e => setEditingGroup({...editingGroup, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs mt-1" />
            </div>
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={editingGroup.isActive} onChange={() => setEditingGroup({...editingGroup, isActive: !editingGroup.isActive})} className="rounded" />
              <span className="text-xs font-bold text-slate-700">Đang hoạt động</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingGroup(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
              <button onClick={handleUpdate} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-black uppercase text-[10px] shadow-lg">Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(ChatGroupManager);