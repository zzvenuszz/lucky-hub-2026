import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useBodyScrollLock, useModalStack } from '../system/ModalManager.tsx';
import { HealthMetric, User } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { formatDateVN } from '../../utils/formatters.ts';
import { cacheManager } from '../../utils/cacheManager.ts';

interface MetricsManagementProps {
  user: User;
  users: User[];
  onAddMetric: (targetId: string) => void;
  refreshTrigger?: number;
}

const renderTrendIcon = (current: number, prev?: number, inverse = false) => {
  if (prev === undefined || current === prev) return null;
  const diff = current - prev;
  const isUp = diff > 0;
  const isGood = inverse ? !isUp : isUp;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-black ml-1 ${isGood ? 'text-emerald-500' : 'text-rose-500'}`}>
      {isUp ? '↑' : '↓'}{Math.abs(diff).toFixed(1)}
    </span>
  );
};

const canEdit = (currentUser: User): boolean => {
  return (currentUser as any).permissions?.includes('metrics:update:any');
};

const canDelete = (currentUser: User): boolean => {
  return (currentUser as any).permissions?.includes('metrics:delete:any');
};

const canViewAny = (currentUser: User): boolean => {
  return (currentUser as any).permissions?.includes('metrics:view:any');
};

const isTargetUserCoach = (targetUser: User | undefined): boolean => {
  if (!targetUser) return false;
  return (
    (targetUser as any).permissions?.includes('coach:access') ||
    (targetUser as any).permissions?.includes('ndd:manage') ||
    (targetUser as any).permissions?.includes('admin:panel')
  );
};

const MetricsManagement: React.FC<MetricsManagementProps> = ({ user, users, onAddMetric, refreshTrigger }) => {
  const currentUid = (user as any).id || (user as any)._id;
  const [selectedUserId, setSelectedUserId] = useState(currentUid);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);
  const [deletingMetric, setDeletingMetric] = useState<HealthMetric | null>(null);
  const [deletingAllConfirm, setDeletingAllConfirm] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const loadMetrics = useCallback(async () => {
    const targetId = !canViewAny(user) ? currentUid : selectedUserId;
    const data = await Database.getMetrics(targetId);
    setMetrics(data || []);
  }, [selectedUserId, user, currentUid]);

  useEffect(() => {
    loadMetrics();
  }, [selectedUserId, refreshTrigger, user, currentUid, loadMetrics]);

  const targetUser = useMemo(() => {
    return users.find(u => {
      const uid = (u as any).id || (u as any)._id;
      return uid === selectedUserId;
    });
  }, [users, selectedUserId]);

  const isViewingOwn = selectedUserId === currentUid;
  const isTargetCoach = useMemo(() => isTargetUserCoach(targetUser), [targetUser]);

  const canEditTarget = !isTargetCoach && (canEdit(user) || isViewingOwn);
  const canDeleteTarget = !isTargetCoach && canDelete(user);

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, [selectedUserId]);

  const handleUpdateMetric = async () => {
    if (!editingMetric) return;
    const mid = editingMetric.id || (editingMetric as any)._id;
    try {
      console.log(`[MetricsManagement] Updating metric ${mid}`);
      await Database.updateMetric(mid, editingMetric);
      setEditingMetric(null);
      setActionMessage({ type: 'success', text: '✅ Đã cập nhật chỉ số thành công' });
      loadMetrics();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
      console.error(`[MetricsManagement] Update error:`, err);
    }
  };

  const handleDeleteMetric = async () => {
    if (!deletingMetric) return;
    const mid = deletingMetric.id || (deletingMetric as any)._id;
    try {
      console.log(`[MetricsManagement] Deleting metric ${mid}`);
      await Database.deleteMetric(mid);
      cacheManager.remove(`metrics_${selectedUserId}`);
      setDeletingMetric(null);
      setActionMessage({ type: 'success', text: '🗑️ Đã xóa chỉ số' });
      loadMetrics();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
      console.error(`[MetricsManagement] Delete error:`, err);
    }
  };

  const handleDeleteAllMetrics = async () => {
    try {
      console.log(`[MetricsManagement] Deleting all metrics for user ${selectedUserId}`);
      await Database.deleteAllUserMetrics(selectedUserId);
      cacheManager.remove(`metrics_${selectedUserId}`);
      setDeletingAllConfirm(false);
      setActionMessage({ type: 'success', text: '🗑️ Đã xóa toàn bộ chỉ số' });
      loadMetrics();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
      console.error(`[MetricsManagement] Delete all error:`, err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      console.log(`[MetricsManagement] Bulk deleting ${ids.length} metrics`);
      await Database.deleteMetricsBulk(ids);
      cacheManager.remove(`metrics_${selectedUserId}`);
      setBulkDeleteConfirm(false);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      setActionMessage({ type: 'success', text: `🗑️ Đã xóa ${ids.length} chỉ số` });
      loadMetrics();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
      console.error(`[MetricsManagement] Bulk delete error:`, err);
    }
  };

  const toggleSelectMetric = (metricId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(metricId)) {
        newSet.delete(metricId);
      } else {
        newSet.add(metricId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === metrics.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(metrics.map(m => m.id || (m as any)._id)));
    }
  };

  const sortedMetrics = useMemo(() => [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [metrics]);

  return (
    <div className="space-y-6">
      {/* Action Message Toast */}
      {actionMessage && (
        <div className={`fixed top-6 right-6 z-[1300] px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right font-bold text-sm ${actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {actionMessage.text}
          <button onClick={() => setActionMessage(null)} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Quản lý chỉ số cơ thể</h2>
          <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">Lịch sử đo lường chi tiết</p>
        </div>
        <div className="flex items-center gap-4">
          {canViewAny(user) && (
            <select 
              value={selectedUserId} 
              onChange={e => setSelectedUserId(e.target.value)} 
              className="bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-xl border-none text-sm outline-none ring-1 ring-emerald-100"
            >
              {users.map(u => (
                <option key={(u as any).id || (u as any)._id} value={(u as any).id || (u as any)._id}>
                  {u.fullName} {(u as any).id === currentUid || (u as any)._id === currentUid ? '(Tôi)' : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => onAddMetric(selectedUserId)} className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-100 font-bold hover:bg-emerald-700 transition-all">+ Thêm mới</button>
          <button 
            onClick={() => {
              const uid = selectedUserId || currentUid;
              Database.exportMetrics(uid, 'csv').catch(err => {
                setActionMessage({ type: 'error', text: '❌ Không thể xuất CSV: ' + err.message });
              });
              console.log(`[Export] Downloading CSV for user ${uid}`);
            }} 
            className="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition-all text-sm flex items-center gap-2"
            title="Xuất dữ liệu CSV"
          >
            📥 CSV
          </button>
        </div>
      </div>

      {editingMetric && (
        <EditMetricModal
          editingMetric={editingMetric}
          setEditingMetric={setEditingMetric}
          handleUpdateMetric={handleUpdateMetric}
        />
      )}

      {deletingMetric && (
        <ConfirmDeleteMetricModal
          deletingMetric={deletingMetric}
          setDeletingMetric={setDeletingMetric}
          handleDeleteMetric={handleDeleteMetric}
        />
      )}

      {deletingAllConfirm && (
        <ConfirmDeleteAllModal
          targetUser={targetUser}
          onCancel={() => setDeletingAllConfirm(false)}
          onConfirm={handleDeleteAllMetrics}
        />
      )}

      {bulkDeleteConfirm && (
        <ConfirmBulkDeleteModal
          selectedCount={selectedIds.size}
          onCancel={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
        />
      )}

      {/* HLV Actions Bar */}
      {(canDeleteTarget || canEditTarget) && sortedMetrics.length > 0 && (
        <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl flex flex-wrap items-center gap-3">
          {canDeleteTarget && (
            <button
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                if (isSelectionMode) setSelectedIds(new Set());
              }}
              className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all border ${isSelectionMode ? 'bg-rose-600 text-white border-rose-600 shadow-lg' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}
            >
              {isSelectionMode ? `❌ Hủy chọn` : `☑️ Chọn nhiều`}
            </button>
          )}

          {isSelectionMode && (
            <>
              <button
                onClick={toggleSelectAll}
                className="px-4 py-2 rounded-xl bg-white text-slate-600 font-black text-[10px] uppercase tracking-wider border border-slate-200 hover:bg-slate-50 transition-all"
              >
                {selectedIds.size === metrics.length ? '📋 Bỏ chọn tất cả' : '📋 Chọn tất cả'}
              </button>
              <span className="text-[11px] font-bold text-slate-500">
                Đã chọn {selectedIds.size} / {metrics.length}
              </span>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase tracking-wider shadow-lg hover:bg-rose-700 transition-all"
                >
                  🗑️ Xóa đã chọn ({selectedIds.size})
                </button>
              )}
            </>
          )}

          {!isSelectionMode && canDeleteTarget && !isViewingOwn && (
            <button
              onClick={() => setDeletingAllConfirm(true)}
              className="px-4 py-2 rounded-xl bg-white text-rose-600 font-black text-[10px] uppercase tracking-wider border border-rose-200 hover:bg-rose-50 transition-all ml-auto"
            >
              🗑️ Xóa tất cả chỉ số
            </button>
          )}
        </div>
      )}

      {/* 📱 Mobile Card View */}
      <div className="mobile-only space-y-3">
        {sortedMetrics.map((m, idx) => {
          const prev = sortedMetrics[idx + 1];
          const mid = m.id || (m as any)._id;
          return (
            <div key={mid} className={`data-card relative ${isSelectionMode ? 'border-2 transition-all' : ''} ${isSelectionMode && selectedIds.has(mid) ? 'border-emerald-500 bg-emerald-50/30' : ''}`}>
              {isSelectionMode && canDeleteTarget && (
                <div className="absolute top-3 left-3 z-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(mid)}
                    onChange={() => toggleSelectMetric(mid)}
                    className="w-5 h-5 rounded-lg accent-emerald-600 cursor-pointer"
                  />
                </div>
              )}
              <div className={`data-card-header ${isSelectionMode ? 'pl-10' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm text-slate-800">📅 {formatDateVN(m.date)}</span>
                  <span className="font-black text-emerald-600 text-sm">
                    {m.weight}kg {renderTrendIcon(m.weight, prev?.weight, true)}
                  </span>
                </div>
              </div>
              <div className="data-card-body">
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  <div>
                    <span className="data-card-label">🧈 Mỡ</span>
                    <div className="data-card-value text-rose-500 justify-start text-left">
                      {m.bodyFat}% {renderTrendIcon(m.bodyFat, prev?.bodyFat, true)}
                    </div>
                  </div>
                  <div>
                    <span className="data-card-label">💪 Cơ</span>
                    <div className="data-card-value text-blue-600 justify-start text-left">
                      {m.muscleMass}kg {renderTrendIcon(m.muscleMass, prev?.muscleMass, false)}
                      {m.weight > 0 && <span className="text-[9px] text-blue-400 ml-1">({((m.muscleMass / m.weight) * 100).toFixed(1)}%)</span>}
                    </div>
                  </div>
                  <div>
                    <span className="data-card-label">⚖️ Cân đối</span>
                    <div className="data-card-value text-indigo-600 justify-start text-left">
                      {m.balanceIndex ?? 0} {renderTrendIcon(m.balanceIndex ?? 0, prev?.balanceIndex, false)}
                    </div>
                  </div>
                  <div>
                    <span className="data-card-label">💧 Nước</span>
                    <div className="data-card-value text-sky-600 justify-start text-left">{m.waterPercent}%</div>
                  </div>
                  <div>
                    <span className="data-card-label">🫁 Mỡ nội tạng</span>
                    <div className="data-card-value text-amber-600 justify-start text-left">
                      {m.visceralFat || '--'} {renderTrendIcon(m.visceralFat || 0, prev?.visceralFat, true)}
                    </div>
                  </div>
                  <div>
                    <span className="data-card-label">🎂 Tuổi SH</span>
                    <div className="data-card-value text-slate-800 justify-start text-left">
                      {m.bioAge || '--'} {renderTrendIcon(m.bioAge || 0, prev?.bioAge, true)}
                    </div>
                  </div>
                  <div>
                    <span className="data-card-label">🦴 Khoáng</span>
                    <div className="data-card-value text-slate-600 justify-start text-left">{m.boneMinerals || '--'}</div>
                  </div>
                  <div>
                    <span className="data-card-label">⚡ Năng lượng</span>
                    <div className="data-card-value text-slate-500 justify-start text-left">{m.energy || '--'} kcal</div>
                  </div>
                </div>
              </div>
              {!isSelectionMode && (canEditTarget || canDeleteTarget || isViewingOwn) && (
                <div className="data-card-actions">
                  {(canEditTarget || isViewingOwn) && (
                    <button 
                      onClick={() => { setEditingMetric({...m}); console.log(`[MetricsManagement] Edit: ${m.date}`); }}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all"
                    >
                      ✏️ Sửa
                    </button>
                  )}
                  {canDeleteTarget && (
                    <button 
                      onClick={() => setDeletingMetric(m)}
                      className="flex-1 py-2.5 rounded-xl bg-rose-50 text-rose-600 font-black text-[9px] uppercase tracking-wider hover:bg-rose-100 transition-all"
                    >
                      🗑️ Xóa
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sortedMetrics.length === 0 && (
          <div className="p-10 text-center text-slate-300 italic text-[11px] font-bold">Chưa có dữ liệu lịch sử đo lường</div>
        )}
      </div>

      {/* 💻 Desktop Table View */}
      <div className="table-desktop">
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-[11px] min-w-[1200px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-400 font-black uppercase tracking-widest">
                  {isSelectionMode && canDeleteTarget && (
                    <th className="p-5 w-12">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === metrics.length && metrics.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="p-5">Ngày đo</th>
                  <th className="p-5">Cân nặng (kg)</th>
                  <th className="p-5">Mỡ cơ thể (%)</th>
                  <th className="p-5">Lượng cơ (kg)</th>
                  <th className="p-5">Cân đối</th>
                  <th className="p-5">Khoáng chất (kg)</th>
                  <th className="p-5">Nước (%)</th>
                  <th className="p-5">Mỡ nội tạng</th>
                  <th className="p-5">Tuổi sinh học</th>
                  <th className="p-5">Năng Lượng (kcal)</th>
                  {!isSelectionMode && (canEditTarget || canDeleteTarget) && <th className="p-5 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedMetrics.map((m, idx) => {
                  const prev = sortedMetrics[idx + 1];
                  const mid = m.id || (m as any)._id;
                  return (
                    <tr key={mid} className={`hover:bg-slate-50/50 transition-colors ${isSelectionMode && selectedIds.has(mid) ? 'bg-emerald-50/50' : ''}`}>
                      {isSelectionMode && canDeleteTarget && (
                        <td className="p-5">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(mid)}
                            onChange={() => toggleSelectMetric(mid)}
                            className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="p-5 font-bold text-slate-700">{formatDateVN(m.date)}</td>
                      <td className="p-5 font-black text-emerald-600">
                        {m.weight} {renderTrendIcon(m.weight, prev?.weight, true)}
                      </td>
                      <td className="p-5 font-bold text-rose-500">
                        {m.bodyFat}% {renderTrendIcon(m.bodyFat, prev?.bodyFat, true)}
                      </td>
                      <td className="p-5">
                        <div className="font-bold text-blue-600">
                          {m.muscleMass} {renderTrendIcon(m.muscleMass, prev?.muscleMass, false)}
                        </div>
                        {m.weight > 0 && (
                          <div className="text-[9px] font-black text-blue-400/70 uppercase tracking-tighter mt-0.5">
                            ({((m.muscleMass / m.weight) * 100).toFixed(1)}%)
                          </div>
                        )}
                      </td>
                      <td className="p-5 font-black text-indigo-600">
                        {m.balanceIndex ?? 0} {renderTrendIcon(m.balanceIndex ?? 0, prev?.balanceIndex, false)}
                      </td>
                      <td className="p-5 text-slate-600">{m.boneMinerals || '--'}</td>
                      <td className="p-5 text-sky-600">{m.waterPercent}%</td>
                      <td className="p-5 font-bold text-amber-600">
                        {m.visceralFat || '--'} {renderTrendIcon(m.visceralFat || 0, prev?.visceralFat, true)}
                      </td>
                      <td className="p-5 font-bold text-slate-800">
                        {m.bioAge || '--'} {renderTrendIcon(m.bioAge || 0, prev?.bioAge, true)}
                      </td>
                      <td className="p-5 text-slate-500">{m.energy || '--'}</td>
                      {!isSelectionMode && (canEditTarget || canDeleteTarget) && (
                        <td className="p-5 text-right space-x-2">
                          {(canEditTarget || isViewingOwn) && (
                            <button 
                              onClick={() => {
                                setEditingMetric({...m});
                                console.log(`[MetricsManagement] Edit: ${m.date}`);
                              }} 
                              className="text-emerald-600 font-black text-[9px] hover:underline uppercase"
                            >
                              Sửa
                            </button>
                          )}
                          {canDeleteTarget && (
                            <button 
                              onClick={() => setDeletingMetric(m)} 
                              className="text-rose-600 font-black text-[9px] hover:underline uppercase ml-3"
                            >
                              Xóa
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {sortedMetrics.length === 0 && (
                  <tr>
                    <td colSpan={isSelectionMode ? 13 : 12} className="p-20 text-center text-slate-400 font-medium italic">Chưa có dữ liệu lịch sử đo lường</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========== Sub Modals ==========

interface EditMetricModalProps {
  editingMetric: HealthMetric;
  setEditingMetric: (v: HealthMetric | null) => void;
  handleUpdateMetric: () => void;
}

const EditMetricModal: React.FC<EditMetricModalProps> = ({ editingMetric, setEditingMetric, handleUpdateMetric }) => {
  const [localMetric, setLocalMetric] = useState<HealthMetric>(editingMetric);
  const modalId = useMemo(() => `edit-metric_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(modalId, () => setEditingMetric(null));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95">
        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Cập nhật chỉ số</h4>
        <p className="text-[10px] text-slate-400 font-medium">Ngày: {formatDateVN(localMetric.date)}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân nặng (kg)</label>
            <input type="number" step="0.1" value={localMetric.weight} onChange={e => setLocalMetric({...localMetric, weight: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mỡ (%)</label>
            <input type="number" step="0.1" value={localMetric.bodyFat} onChange={e => setLocalMetric({...localMetric, bodyFat: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cơ (kg)</label>
            <input type="number" step="0.1" value={localMetric.muscleMass} onChange={e => setLocalMetric({...localMetric, muscleMass: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân đối</label>
            <input type="number" value={localMetric.balanceIndex} onChange={e => setLocalMetric({...localMetric, balanceIndex: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nước (%)</label>
            <input type="number" step="0.1" value={localMetric.waterPercent} onChange={e => setLocalMetric({...localMetric, waterPercent: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Khoáng (kg)</label>
            <input type="number" step="0.01" value={localMetric.boneMinerals} onChange={e => setLocalMetric({...localMetric, boneMinerals: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mỡ nội tạng</label>
            <input type="number" step="0.1" value={localMetric.visceralFat} onChange={e => setLocalMetric({...localMetric, visceralFat: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tuổi sinh học</label>
            <input type="number" value={localMetric.bioAge} onChange={e => setLocalMetric({...localMetric, bioAge: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
          </div>
        </div>
        <div className="flex gap-3 pt-4">
          <button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
          <button onClick={handleUpdateMetric} className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg">Lưu chỉ số</button>
        </div>
      </div>
    </div>
  );
};

EditMetricModal.displayName = 'EditMetricModal';

interface ConfirmDeleteMetricModalProps {
  deletingMetric: HealthMetric;
  setDeletingMetric: (v: HealthMetric | null) => void;
  handleDeleteMetric: () => void;
}

const ConfirmDeleteMetricModal: React.FC<ConfirmDeleteMetricModalProps> = ({ deletingMetric, setDeletingMetric, handleDeleteMetric }) => {
  const modalId = useMemo(() => `confirm-delete_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(modalId, () => setDeletingMetric(null));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 text-center">
        <div className="text-5xl mb-2">⚠️</div>
        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Xác nhận xóa</h4>
        <p className="text-slate-600 text-sm leading-relaxed">
          Bạn có chắc chắn muốn xóa chỉ số ngày <strong>{formatDateVN(deletingMetric.date)}</strong>?
          <br />
          <span className="text-rose-500 text-[10px] font-black mt-2 block">
            Hành động này không thể hoàn tác!
          </span>
        </p>
        <div className="flex gap-3 pt-4">
          <button onClick={() => setDeletingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
          <button onClick={handleDeleteMetric} className="flex-1 py-4 rounded-2xl bg-rose-600 text-white font-black uppercase text-[11px] shadow-lg shadow-rose-200">Xác nhận xóa</button>
        </div>
      </div>
    </div>
  );
};

ConfirmDeleteMetricModal.displayName = 'ConfirmDeleteMetricModal';

interface ConfirmDeleteAllModalProps {
  targetUser: User | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteAllModal: React.FC<ConfirmDeleteAllModalProps> = ({ targetUser, onCancel, onConfirm }) => {
  const modalId = useMemo(() => `confirm-delete-all_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(modalId, onCancel);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 text-center">
        <div className="text-5xl mb-2">🚨</div>
        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Xóa toàn bộ chỉ số</h4>
        <p className="text-slate-600 text-sm leading-relaxed">
          Bạn có chắc chắn muốn xóa <strong>toàn bộ chỉ số</strong> của <strong>{targetUser?.fullName || 'hội viên này'}</strong>?
          <br />
          <span className="text-rose-500 text-[10px] font-black mt-2 block">
            ⚠️ Hành động này không thể hoàn tác! ⚠️
          </span>
        </p>
        <div className="flex gap-3 pt-4">
          <button onClick={onCancel} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
          <button onClick={onConfirm} className="flex-1 py-4 rounded-2xl bg-rose-600 text-white font-black uppercase text-[11px] shadow-lg shadow-rose-200">Xác nhận xóa tất cả</button>
        </div>
      </div>
    </div>
  );
};

ConfirmDeleteAllModal.displayName = 'ConfirmDeleteAllModal';

interface ConfirmBulkDeleteModalProps {
  selectedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmBulkDeleteModal: React.FC<ConfirmBulkDeleteModalProps> = ({ selectedCount, onCancel, onConfirm }) => {
  const modalId = useMemo(() => `confirm-bulk-delete_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(modalId, onCancel);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 text-center">
        <div className="text-5xl mb-2">⚠️</div>
        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Xóa nhiều chỉ số</h4>
        <p className="text-slate-600 text-sm leading-relaxed">
          Bạn có chắc chắn muốn xóa <strong>{selectedCount} chỉ số</strong> đã chọn?
          <br />
          <span className="text-rose-500 text-[10px] font-black mt-2 block">
            Hành động này không thể hoàn tác!
          </span>
        </p>
        <div className="flex gap-3 pt-4">
          <button onClick={onCancel} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
          <button onClick={onConfirm} className="flex-1 py-4 rounded-2xl bg-rose-600 text-white font-black uppercase text-[11px] shadow-lg shadow-rose-200">Xác nhận xóa {selectedCount} chỉ số</button>
        </div>
      </div>
    </div>
  );
};

ConfirmBulkDeleteModal.displayName = 'ConfirmBulkDeleteModal';

export default MetricsManagement;