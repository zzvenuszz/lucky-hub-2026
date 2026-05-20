import React, { useMemo, useState, useEffect } from 'react';
import { HealthMetric, User, UserRole } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { formatDateVN } from '../../utils/formatters.ts';

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

// Helper kiểm tra quyền (chỉ dùng permissions từ group)
const canEdit = (user: User): boolean => {
  return (user as any).permissions?.includes('metrics:update:any');
};

const canDelete = (user: User): boolean => {
  return (user as any).permissions?.includes('metrics:delete:any');
};

const MetricsManagement: React.FC<MetricsManagementProps> = ({ user, users, onAddMetric, refreshTrigger }) => {
  const currentUid = (user as any).id || (user as any)._id;
  const [selectedUserId, setSelectedUserId] = useState(currentUid);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);
  const [deletingMetric, setDeletingMetric] = useState<HealthMetric | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadMetrics = async () => {
    const canViewAny = (user as any).permissions?.includes('metrics:view:any');
    const targetId = !canViewAny ? currentUid : selectedUserId;
    const data = await Database.getMetrics(targetId);
    setMetrics(data || []);
  };

  useEffect(() => {
    loadMetrics();
  }, [selectedUserId, refreshTrigger, user, currentUid]);

  // Xác định xem user đang xem của ai
  const isViewingOwn = selectedUserId === currentUid;

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
      setDeletingMetric(null);
      setActionMessage({ type: 'success', text: '🗑️ Đã xóa chỉ số' });
      loadMetrics();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
      console.error(`[MetricsManagement] Delete error:`, err);
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
          {(user as any).permissions?.includes('metrics:view:any') && (
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

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-[11px] min-w-[1200px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-400 font-black uppercase tracking-widest">
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
                {(canEdit(user) || canDelete(user)) && <th className="p-5 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedMetrics.map((m, idx) => {
                const prev = sortedMetrics[idx + 1];
                const mid = m.id || (m as any)._id;
                return (
                  <tr key={mid} className="hover:bg-slate-50/50 transition-colors">
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
                    {(canEdit(user) || canDelete(user)) && (
                      <td className="p-5 text-right space-x-2">
                        {/* MEMBER chỉ sửa được của mình, COACH/ADMIN sửa được tất cả */}
                        {(canEdit(user) || isViewingOwn) && (
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
                        {/* Chỉ COACH/ADMIN mới xóa được */}
                        {canDelete(user) && (
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
                  <td colSpan={12} className="p-20 text-center text-slate-400 font-medium italic">Chưa có dữ liệu lịch sử đo lường</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Metric Modal */}
      {editingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Cập nhật chỉ số</h4>
            <p className="text-[10px] text-slate-400 font-medium">Ngày: {formatDateVN(editingMetric.date)}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân nặng (kg)</label>
                <input type="number" step="0.1" value={editingMetric.weight} onChange={e => setEditingMetric({...editingMetric, weight: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mỡ (%)</label>
                <input type="number" step="0.1" value={editingMetric.bodyFat} onChange={e => setEditingMetric({...editingMetric, bodyFat: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cơ (kg)</label>
                <input type="number" step="0.1" value={editingMetric.muscleMass} onChange={e => setEditingMetric({...editingMetric, muscleMass: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân đối</label>
                <input type="number" value={editingMetric.balanceIndex} onChange={e => setEditingMetric({...editingMetric, balanceIndex: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nước (%)</label>
                <input type="number" step="0.1" value={editingMetric.waterPercent} onChange={e => setEditingMetric({...editingMetric, waterPercent: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Khoáng (kg)</label>
                <input type="number" step="0.01" value={editingMetric.boneMinerals} onChange={e => setEditingMetric({...editingMetric, boneMinerals: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mỡ nội tạng</label>
                <input type="number" step="0.1" value={editingMetric.visceralFat} onChange={e => setEditingMetric({...editingMetric, visceralFat: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tuổi sinh học</label>
                <input type="number" value={editingMetric.bioAge} onChange={e => setEditingMetric({...editingMetric, bioAge: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
              <button onClick={handleUpdateMetric} className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg">Lưu chỉ số</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deletingMetric && (
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
      )}
    </div>
  );
};

export default MetricsManagement;