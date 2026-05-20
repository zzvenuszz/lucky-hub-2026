import React, { useState, useEffect, memo } from 'react';
import { User, HealthMetric } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { formatDateVN } from '../../utils/formatters.ts';

interface MetricAdminProps {
  users: User[];
  onRefresh: () => void;
}

const MetricAdmin: React.FC<MetricAdminProps> = ({ users, onRefresh }) => {
  const [selectedMetricUser, setSelectedMetricUser] = useState<User | null>(null);
  const [userMetrics, setUserMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);
  const [deletingMetric, setDeletingMetric] = useState<HealthMetric | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUserMetrics = async () => {
    try {
      if (selectedMetricUser) {
        const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
        console.log(`[MetricAdmin] Loading metrics for user: ${selectedMetricUser.fullName} (${uid})`);
        const m = await Database.getMetrics(uid);
        setUserMetrics(m || []);
        console.log(`[MetricAdmin] Loaded ${m?.length || 0} metrics`);
      }
    } catch (error) {
      console.error(`[MetricAdmin] Error loading user metrics:`, error);
      setUserMetrics([]);
    }
  };

  useEffect(() => { loadUserMetrics(); }, [selectedMetricUser]);

  const handleUpdateMetric = async () => {
    if (!editingMetric) return;
    const mid = editingMetric.id || (editingMetric as any)._id;
    try {
      await Database.updateMetric(mid, editingMetric);
      setEditingMetric(null);
      setActionMessage({ type: 'success', text: '✅ Đã cập nhật chỉ số' });
      loadUserMetrics();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleDeleteMetric = async () => {
    if (!deletingMetric) return;
    const mid = deletingMetric.id || (deletingMetric as any)._id;
    try {
      await Database.deleteMetric(mid);
      setDeletingMetric(null);
      setActionMessage({ type: 'success', text: '🗑️ Đã xóa chỉ số' });
      loadUserMetrics();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 items-start animate-in fade-in">
      {/* Action Message Toast */}
      {actionMessage && (
        <div className={`fixed top-6 right-6 z-[1300] px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right font-bold text-sm ${actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {actionMessage.text}
          <button onClick={() => setActionMessage(null)} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="lg:col-span-3 bg-slate-50/50 p-4 md:p-6 rounded-[2rem] border border-slate-100 space-y-4">
        <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest">Danh sách Hội viên</h3>
        <div className="max-h-[500px] overflow-y-auto no-scrollbar space-y-2">
          {users.map(u => (
            <div 
              key={(u as any).id || (u as any)._id} 
              onClick={() => setSelectedMetricUser(u)} 
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-emerald-200 text-slate-600'}`}
            >
              <div className="font-bold text-[12px]">{u.fullName}</div>
              <div className={`text-[9px] font-medium ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'text-emerald-100' : 'text-slate-400'}`}>@{u.username}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="lg:col-span-9 bg-white p-4 md:p-6 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[500px]">
        {selectedMetricUser ? (
          <>
            {/* Header */}
            <h4 className="font-black text-slate-800 text-xs mb-4 md:mb-6 uppercase tracking-widest px-2">Lịch sử chỉ số: {selectedMetricUser.fullName}</h4>

            {/* 📱 Mobile Cards */}
            <div className="mobile-only space-y-3">
              {userMetrics.map(m => (
                <div key={m.id || (m as any)._id} className="data-card">
                  <div className="grid grid-cols-2 gap-y-2 gap-x-3 mb-3">
                    <div className="data-card-row col-span-2 border-b border-slate-50 pb-1 mb-1">
                      <span className="data-card-label">📅 Ngày</span>
                      <span className="data-card-value text-emerald-600">{formatDateVN(m.date)}</span>
                    </div>
                    <div>
                      <span className="data-card-label">⚖️ Cân nặng</span>
                      <div className="data-card-value text-emerald-600">{m.weight}kg</div>
                    </div>
                    <div>
                      <span className="data-card-label">🧈 Mỡ %</span>
                      <div className="data-card-value text-rose-500">{m.bodyFat}%</div>
                    </div>
                    <div>
                      <span className="data-card-label">💪 Cơ (kg)</span>
                      <div className="data-card-value text-blue-600">{m.muscleMass}kg</div>
                    </div>
                    <div>
                      <span className="data-card-label">⚖️ Cân đối</span>
                      <div className="data-card-value text-indigo-600">{m.balanceIndex ?? 0}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="data-card-label">🫁 Mỡ nội tạng</span>
                      <div className="data-card-value text-amber-600 inline ml-2 font-bold">{m.visceralFat ?? 0}</div>
                    </div>
                  </div>
                  <div className="data-card-actions">
                    <button 
                      onClick={() => { setEditingMetric(m); console.log(`[MetricAdmin] Edit metric: ${m.date}`); }}
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
              {userMetrics.length === 0 && (
                <div className="p-10 text-center text-slate-300 italic text-[11px] font-bold">Chưa có dữ liệu cho hội viên này</div>
              )}
            </div>

            {/* 💻 Desktop Table */}
            <div className="table-desktop">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-[11px] text-left min-w-[1000px]">
                  <thead className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-50">
                    <tr>
                      <th className="p-3">Ngày</th>
                      <th className="p-3">Cân nặng</th>
                      <th className="p-3">Mỡ %</th>
                      <th className="p-3">Cơ (kg)</th>
                      <th className="p-3">Cân đối</th>
                      <th className="p-3">Mỡ nội tạng</th>
                      <th className="p-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {userMetrics.map(m => (
                      <tr key={m.id || (m as any)._id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold">{formatDateVN(m.date)}</td>
                        <td className="p-3 text-emerald-600 font-black">{m.weight}kg</td>
                        <td className="p-3 text-rose-500 font-bold">{m.bodyFat}%</td>
                        <td className="p-3 text-blue-600 font-bold">{m.muscleMass}kg</td>
                        <td className="p-3 font-bold text-indigo-600">{m.balanceIndex ?? 0}</td>
                        <td className="p-3 font-bold text-amber-600">{m.visceralFat ?? 0}</td>
                        <td className="p-3 text-right space-x-2">
                          <button 
                            onClick={() => {
                              setEditingMetric(m);
                              console.log(`[MetricAdmin] Edit metric: ${m.date} (${m.id || (m as any)._id})`);
                            }} 
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
                {userMetrics.length === 0 && (
                  <div className="p-20 text-center text-slate-300 italic uppercase text-[10px] font-black tracking-widest">Chưa có dữ liệu cho hội viên này</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="p-10 md:p-20 flex flex-col items-center justify-center space-y-4 opacity-30">
            <span className="text-6xl">📈</span>
            <div className="text-center text-slate-500 uppercase text-[10px] font-black tracking-widest">Chọn hội viên từ danh sách bên trái để xem và quản lý chỉ số</div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Cập nhật chỉ số nhanh</h4>
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
              <span className="text-rose-500 text-[10px] font-black mt-2 block">Hành động này không thể hoàn tác!</span>
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

export default memo(MetricAdmin);