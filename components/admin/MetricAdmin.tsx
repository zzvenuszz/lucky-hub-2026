
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in">
      <div className="lg:col-span-3 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
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
      <div className="lg:col-span-9 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[500px]">
        {selectedMetricUser ? (
          <div className="overflow-x-auto no-scrollbar">
            <h4 className="font-black text-slate-800 text-xs mb-6 uppercase tracking-widest px-2">Lịch sử chỉ số: {selectedMetricUser.fullName}</h4>
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
                    <td className="p-3 text-right">
                       <button 
                         onClick={() => {
                           setEditingMetric(m);
                           console.log(`[MetricAdmin] Edit metric: ${m.date} (${m.id || (m as any)._id})`);
                         }} 
                         className="text-emerald-600 font-black text-[9px] hover:underline uppercase"
                       >
                         Sửa
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
        ) : (
          <div className="p-20 flex flex-col items-center justify-center space-y-4 opacity-30">
            <span className="text-6xl">📈</span>
            <div className="text-center text-slate-500 uppercase text-[10px] font-black tracking-widest">Chọn hội viên từ danh sách bên trái để xem và quản lý chỉ số</div>
          </div>
        )}
      </div>

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
              <button 
                onClick={async () => {
                  const mid = editingMetric.id || (editingMetric as any)._id;
                  await Database.updateMetric(mid, editingMetric);
                  setEditingMetric(null);
                  loadUserMetrics();
                }} 
                className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg"
              >
                Lưu chỉ số
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(MetricAdmin);
