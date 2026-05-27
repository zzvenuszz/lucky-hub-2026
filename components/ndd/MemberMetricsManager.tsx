import React, { useState, useEffect, useCallback, memo } from 'react';
import { HealthMetric } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { formatDateVN } from '../../utils/formatters.ts';
import MetricForm from '../dashboard/MetricForm.tsx';

interface MemberMetricsManagerProps {
  userId: string;
  userName: string;
  currentUser: any;
  onClose: () => void;
}

const MemberMetricsManager: React.FC<MemberMetricsManagerProps> = memo(({
  userId,
  userName,
  currentUser,
  onClose
}) => {
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);
  const [deletingMetric, setDeletingMetric] = useState<HealthMetric | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log(`[MemberMetricsManager] Loading metrics for user: ${userName} (${userId})`);
      const m = await Database.getMetrics(userId);
      setMetrics(m || []);
      console.log(`[MemberMetricsManager] Loaded ${m?.length || 0} metrics`);
    } catch (err: any) {
      console.error(`[MemberMetricsManager] Error:`, err);
      setActionMsg({ type: 'error', text: '❌ Lỗi tải dữ liệu: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  }, [userId, userName]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  // Save single metric (từ MetricForm)
  const handleSaveMetric = useCallback(async (metric: Omit<HealthMetric, 'id' | 'userId'>) => {
    try {
      await Database.saveMetric({
        ...metric,
        userId,
        actorId: (currentUser as any).id || (currentUser as any)._id,
        actorName: currentUser?.fullName,
      });
      setShowAddForm(false);
      setActionMsg({ type: 'success', text: '✅ Đã thêm chỉ số mới' });
      loadMetrics();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  }, [userId, currentUser, loadMetrics]);

  // Save bulk metrics (từ MetricForm - quét ảnh hàng loạt)
  const handleSaveBulk = useCallback(async (metricsData: Omit<HealthMetric, 'id' | 'userId'>[]) => {
    try {
      const bulkData = metricsData.map(m => ({
        ...m,
        userId,
        actorId: (currentUser as any).id || (currentUser as any)._id,
        actorName: currentUser?.fullName,
      }));
      await Database.saveMetricsBulk({ metrics: bulkData });
      setShowAddForm(false);
      setActionMsg({ type: 'success', text: `✅ Đã thêm ${metricsData.length} chỉ số` });
      loadMetrics();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  }, [userId, currentUser, loadMetrics]);

  // Update metric
  const handleUpdateMetric = useCallback(async () => {
    if (!editingMetric) return;
    const mid = editingMetric.id || (editingMetric as any)._id;
    try {
      await Database.updateMetric(mid, editingMetric);
      setEditingMetric(null);
      setActionMsg({ type: 'success', text: '✅ Đã cập nhật chỉ số' });
      loadMetrics();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  }, [editingMetric, loadMetrics]);

  // Delete metric
  const handleDeleteMetric = useCallback(async () => {
    if (!deletingMetric) return;
    const mid = deletingMetric.id || (deletingMetric as any)._id;
    try {
      await Database.deleteMetric(mid);
      setDeletingMetric(null);
      setActionMsg({ type: 'success', text: '🗑️ Đã xóa chỉ số' });
      loadMetrics();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  }, [deletingMetric, loadMetrics]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-black text-lg">📊 Quản lý chỉ số</h2>
            <p className="text-emerald-100 text-xs font-medium mt-0.5">{userName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all"
            >
              + Thêm chỉ số
            </button>
            <button onClick={onClose} className="text-white text-xl hover:scale-110 transition-all ml-2 font-bold">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 overflow-y-auto no-scrollbar flex-1">
          {/* Toast */}
          {actionMsg && (
            <div className={`mb-4 px-5 py-3 rounded-2xl shadow-lg font-bold text-sm flex items-center justify-between ${
              actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              <span>{actionMsg.text}</span>
              <button onClick={() => setActionMsg(null)} className="opacity-50 hover:opacity-100">✕</button>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <span className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400 font-bold mt-4">Đang tải dữ liệu...</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && metrics.length === 0 && !showAddForm && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-5xl mb-4">📈</div>
              <p className="text-lg font-bold text-slate-600">Chưa có chỉ số nào</p>
              <p className="text-xs text-slate-400 mt-2">Nhấn "Thêm chỉ số" để cập nhật</p>
            </div>
          )}

          {/* Metric Form (Add mode) */}
          {showAddForm && (
            <div className="relative">
              <MetricForm
                onSave={handleSaveMetric}
                onSaveBulk={handleSaveBulk}
                existingDates={metrics.map(m => m.date)}
                onClose={() => setShowAddForm(false)}
              />
            </div>
          )}

          {/* Metric List (Mobile Cards) */}
          {!isLoading && metrics.length > 0 && !showAddForm && (
            <>
              {/* Mobile view */}
              <div className="space-y-3 md:hidden">
                {metrics.map(m => (
                  <div key={m.id || (m as any)._id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-black text-sm text-slate-800">📅 {formatDateVN(m.date)}</span>
                      <span className="font-black text-emerald-600 text-sm">{m.weight}kg</span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] mb-3">
                      <div><span className="text-slate-400">🧈 Mỡ:</span> <span className="font-bold text-rose-500">{m.bodyFat}%</span></div>
                      <div><span className="text-slate-400">💪 Cơ:</span> <span className="font-bold text-blue-600">{m.muscleMass}kg</span></div>
                      <div><span className="text-slate-400">⚖️ Cân đối:</span> <span className="font-bold text-indigo-600">{m.balanceIndex ?? 0}</span></div>
                      <div><span className="text-slate-400">🫁 Mỡ nội tạng:</span> <span className="font-bold text-amber-600">{m.visceralFat ?? 0}</span></div>
                      <div><span className="text-slate-400">💧 Nước:</span> <span className="font-bold text-sky-600">{m.waterPercent}%</span></div>
                      <div><span className="text-slate-400">🦴 Khoáng:</span> <span className="font-bold text-slate-600">{m.boneMinerals}kg</span></div>
                      <div><span className="text-slate-400">🔥 Năng lượng:</span> <span className="font-bold text-slate-600">{m.energy}kcal</span></div>
                      <div><span className="text-slate-400">🧬 Tuổi SH:</span> <span className="font-bold text-slate-600">{m.bioAge}</span></div>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-200">
                      <button
                        onClick={() => setEditingMetric(m)}
                        className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all"
                      >
                        ✏️ Sửa
                      </button>
                      <button
                        onClick={() => setDeletingMetric(m)}
                        className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-600 font-black text-[9px] uppercase tracking-wider hover:bg-rose-100 transition-all"
                      >
                        🗑️ Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto no-scrollbar">
                <table className="w-full text-[11px] text-left min-w-[900px]">
                  <thead className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-50">
                    <tr>
                      <th className="p-3">Ngày</th>
                      <th className="p-3">Cân nặng</th>
                      <th className="p-3">Mỡ %</th>
                      <th className="p-3">Cơ (kg)</th>
                      <th className="p-3">Cân đối</th>
                      <th className="p-3">Mỡ nội tạng</th>
                      <th className="p-3">Nước %</th>
                      <th className="p-3">Khoáng</th>
                      <th className="p-3">Năng lượng</th>
                      <th className="p-3">Tuổi SH</th>
                      <th className="p-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {metrics.map(m => (
                      <tr key={m.id || (m as any)._id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold">{formatDateVN(m.date)}</td>
                        <td className="p-3 text-emerald-600 font-black">{m.weight}kg</td>
                        <td className="p-3 text-rose-500 font-bold">{m.bodyFat}%</td>
                        <td className="p-3 text-blue-600 font-bold">{m.muscleMass}kg</td>
                        <td className="p-3 font-bold text-indigo-600">{m.balanceIndex ?? 0}</td>
                        <td className="p-3 font-bold text-amber-600">{m.visceralFat ?? 0}</td>
                        <td className="p-3 text-sky-600">{m.waterPercent}%</td>
                        <td className="p-3 text-slate-600">{m.boneMinerals}kg</td>
                        <td className="p-3 text-slate-600">{m.energy}kcal</td>
                        <td className="p-3 text-slate-700 font-bold">{m.bioAge}</td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => setEditingMetric(m)}
                            className="text-emerald-600 font-black text-[9px] hover:underline uppercase"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => setDeletingMetric(m)}
                            className="text-rose-600 font-black text-[9px] hover:underline uppercase"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1300] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 shadow-2xl">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">
              ✏️ Cập nhật chỉ số - {formatDateVN(editingMetric.date)}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân nặng (kg)</label>
                <input
                  type="number" step="0.1"
                  value={editingMetric.weight}
                  onChange={e => setEditingMetric({...editingMetric, weight: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mỡ (%)</label>
                <input
                  type="number" step="0.1"
                  value={editingMetric.bodyFat}
                  onChange={e => setEditingMetric({...editingMetric, bodyFat: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cơ (kg)</label>
                <input
                  type="number" step="0.1"
                  value={editingMetric.muscleMass}
                  onChange={e => setEditingMetric({...editingMetric, muscleMass: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân đối</label>
                <input
                  type="number"
                  value={editingMetric.balanceIndex}
                  onChange={e => setEditingMetric({...editingMetric, balanceIndex: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mỡ nội tạng</label>
                <input
                  type="number"
                  value={editingMetric.visceralFat}
                  onChange={e => setEditingMetric({...editingMetric, visceralFat: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nước (%)</label>
                <input
                  type="number" step="0.1"
                  value={editingMetric.waterPercent}
                  onChange={e => setEditingMetric({...editingMetric, waterPercent: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Khoáng chất (kg)</label>
                <input
                  type="number" step="0.1"
                  value={editingMetric.boneMinerals}
                  onChange={e => setEditingMetric({...editingMetric, boneMinerals: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Năng lượng (kcal)</label>
                <input
                  type="number"
                  value={editingMetric.energy}
                  onChange={e => setEditingMetric({...editingMetric, energy: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tuổi sinh học</label>
                <input
                  type="number"
                  value={editingMetric.bioAge}
                  onChange={e => setEditingMetric({...editingMetric, bioAge: Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px] hover:bg-slate-200 transition-all">
                Hủy
              </button>
              <button onClick={handleUpdateMetric} className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg hover:bg-emerald-700 transition-all">
                Lưu chỉ số
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deletingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1300] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 text-center shadow-2xl">
            <div className="text-5xl mb-2">⚠️</div>
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Xác nhận xóa</h4>
            <p className="text-slate-600 text-sm leading-relaxed">
              Bạn có chắc chắn muốn xóa chỉ số ngày <strong>{formatDateVN(deletingMetric.date)}</strong>?
              <br />
              <span className="text-rose-500 text-[10px] font-black mt-2 block">Hành động này không thể hoàn tác!</span>
            </p>
            <div className="flex gap-3 pt-4">
              <button onClick={() => setDeletingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px] hover:bg-slate-200 transition-all">
                Hủy
              </button>
              <button onClick={handleDeleteMetric} className="flex-1 py-4 rounded-2xl bg-rose-600 text-white font-black uppercase text-[11px] shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all">
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

MemberMetricsManager.displayName = 'MemberMetricsManager';
export default MemberMetricsManager;