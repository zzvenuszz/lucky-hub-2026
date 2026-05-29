import React, { useState, useEffect, useCallback, memo } from 'react';
import { Database } from '../../../services/database.ts';

const BranchManager: React.FC = () => {
  const [branches, setBranches] = useState<any[]>([]);
  const [nutritionGroups, setNutritionGroups] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newBranch, setNewBranch] = useState({ name: '', nutritionGroupIds: [] as string[] });
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    // Tải danh sách NDD riêng, không phụ thuộc vào branches
    Database.getAllNutritionGroups()
      .then(nddData => {
        setNutritionGroups(nddData || []);
        console.log(`[BranchManager] Loaded ${nddData?.length || 0} NDD groups`);
      })
      .catch(err => {
        console.error('[BranchManager] Error loading NDD groups:', err);
      });

    try {
      const branchData = await Database.getAllNutritionBranches();
      setBranches(branchData || []);
      console.log(`[BranchManager] Loaded ${branchData?.length || 0} branches`);
    } catch (err) {
      console.error('[BranchManager] Error loading branches:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!newBranch.name.trim()) {
      setActionMsg({ type: 'error', text: '❌ Tên nhánh là bắt buộc' });
      return;
    }
    if (newBranch.nutritionGroupIds.length < 2) {
      setActionMsg({ type: 'error', text: '❌ Cần chọn ít nhất 2 NDD' });
      return;
    }
    try {
      await Database.createNutritionBranch({
        name: newBranch.name.trim(),
        nutritionGroupIds: newBranch.nutritionGroupIds,
      });
      setNewBranch({ name: '', nutritionGroupIds: [] });
      setIsCreating(false);
      setActionMsg({ type: 'success', text: '✅ Đã tạo nhánh mới' });
      loadData();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + (err.message || err) });
    }
  };

  const handleUpdate = async () => {
    if (!editingBranch) return;
    const bid = editingBranch.id || editingBranch._id;
    try {
      await Database.updateNutritionBranch(bid, {
        name: editingBranch.name,
        nutritionGroupIds: editingBranch.nutritionGroupIds,
        isActive: editingBranch.isActive,
      });
      setEditingBranch(null);
      setActionMsg({ type: 'success', text: '✅ Đã cập nhật nhánh' });
      loadData();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleDelete = async (branch: any) => {
    const bid = branch.id || branch._id;
    if (!confirm(`Xóa nhánh "${branch.name}"?`)) return;
    try {
      await Database.deleteNutritionBranch(bid);
      setActionMsg({ type: 'success', text: `🗑️ Đã xóa nhánh "${branch.name}"` });
      loadData();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const getNddNames = (ids: any[]) => {
    return ids.map((item: any) => {
      // Nếu item là object đã populate (có name, _id)
      if (typeof item === 'object' && item !== null) {
        return item.name || 'Unknown';
      }
      // Nếu item là string ID -> lookup trong nutritionGroups
      const ng = nutritionGroups.find(g => (g.id || g._id) === item);
      return ng?.name || 'Unknown';
    }).join(', ');
  };

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <span className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        <h2 className="font-black text-slate-800 text-sm uppercase tracking-widest">🌐 Quản lý Nhánh NDD</h2>
        <button onClick={() => setIsCreating(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-bold text-xs hover:bg-indigo-700 transition-all">
          + Tạo nhánh mới
        </button>
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="bg-white p-6 rounded-[2rem] border border-indigo-200 shadow-sm space-y-4">
          <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Thông tin nhánh mới</h3>
          <input
            placeholder="Tên nhánh *"
            value={newBranch.name}
            onChange={e => setNewBranch({...newBranch, name: e.target.value})}
            className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs"
          />

          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">
              Chọn NDD tham gia <span className="text-rose-500">(tối thiểu 2)</span>
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {nutritionGroups.filter(g => g.isActive !== false).map(ng => {
                const ngId = ng.id || ng._id;
                const isSelected = newBranch.nutritionGroupIds.includes(ngId);
                return (
                  <label key={ngId} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const updated = isSelected
                          ? newBranch.nutritionGroupIds.filter(id => id !== ngId)
                          : [...newBranch.nutritionGroupIds, ngId];
                        setNewBranch({...newBranch, nutritionGroupIds: updated});
                      }}
                      className="rounded"
                    />
                    <span className="font-bold text-slate-700">{ng.name}</span>
                    <span className="text-[9px] text-slate-400">({ng.members?.length || 0} hội viên)</span>
                  </label>
                );
              })}
              {nutritionGroups.length === 0 && (
                <p className="text-[10px] text-slate-400 italic">Chưa có NDD nào. Hãy tạo NDD trước.</p>
              )}
            </div>
            {newBranch.nutritionGroupIds.length > 0 && (
              <p className="text-[9px] text-emerald-600 font-bold mt-2">
                ✅ Đã chọn {newBranch.nutritionGroupIds.length} NDD
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setIsCreating(false)} className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
            <button onClick={handleCreate} className="px-6 py-3 rounded-2xl bg-indigo-600 text-white font-black uppercase text-[10px] shadow-lg">Tạo nhánh</button>
          </div>
        </div>
      )}

      {/* Branch List */}
      <div className="space-y-3">
        {branches.map(branch => {
          const bid = branch.id || branch._id;
          const isExpanded = expandedBranch === bid;
          const nddCount = branch.nutritionGroupIds?.length || 0;
          const memberCount = branch.memberIds?.length || 0;

          return (
            <div key={bid} className="bg-white rounded-[2rem] border border-indigo-200 shadow-sm overflow-hidden hover:border-indigo-400 transition-all">
              <div
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedBranch(isExpanded ? null : bid)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-lg shrink-0">🌐</div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-800 truncate">{branch.name}</h3>
                    <p className="text-[10px] text-slate-400">
                      {nddCount} NDD • {memberCount} thành viên
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${branch.isActive !== false ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {branch.isActive !== false ? 'Hoạt động' : 'Tạm dừng'}
                  </span>
                  <span className="text-slate-300 text-lg transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-5 pb-4 border-t border-indigo-100">
                  <div className="pt-4 space-y-3">
                    {/* NDD List in branch */}
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                        🏥 NDD trong nhánh ({nddCount})
                      </p>
                      {branch.nutritionGroupIds?.length > 0 ? (
                        <p className="text-xs text-slate-600 bg-indigo-50 rounded-xl p-3">
                          {getNddNames(branch.nutritionGroupIds)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Chưa có NDD</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-indigo-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingBranch({...branch}); }}
                        className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all"
                      >
                        ✏️ Sửa
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(branch); }}
                        className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-600 font-black text-[9px] uppercase tracking-wider hover:bg-rose-100 transition-all"
                      >
                        🗑️ Xóa
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {branches.length === 0 && !isCreating && (
          <div className="p-16 text-center text-slate-300 italic uppercase text-[10px] font-black tracking-widest">
            Chưa có nhánh NDD nào. Hãy tạo nhánh đầu tiên!
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingBranch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
          <div className="bg-white w-full max-w-lg rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Chỉnh sửa nhánh: {editingBranch.name}</h4>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên nhánh</label>
              <input
                value={editingBranch.name}
                onChange={e => setEditingBranch({...editingBranch, name: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs mt-1"
              />
            </div>
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={editingBranch.isActive !== false}
                onChange={() => setEditingBranch({...editingBranch, isActive: editingBranch.isActive !== false ? false : true})}
                className="rounded"
              />
              <span className="text-xs font-bold text-slate-700">Đang hoạt động</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingBranch(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
              <button onClick={handleUpdate} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-black uppercase text-[10px] shadow-lg">Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(BranchManager);