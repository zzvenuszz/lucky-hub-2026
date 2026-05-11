
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

const MetricsManagement: React.FC<MetricsManagementProps> = ({ user, users, onAddMetric, refreshTrigger }) => {
  const currentUid = (user as any).id || (user as any)._id;
  const [selectedUserId, setSelectedUserId] = useState(currentUid);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);

  useEffect(() => {
    const load = async () => {
      const targetId = user.role === UserRole.MEMBER ? currentUid : selectedUserId;
      const data = await Database.getMetrics(targetId);
      setMetrics(data || []);
    };
    load();
  }, [selectedUserId, refreshTrigger, user.role, currentUid]);

  const sortedMetrics = useMemo(() => [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [metrics]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Quản lý chỉ số cơ thể</h2>
          <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">Lịch sử đo lường chi tiết</p>
        </div>
        <div className="flex items-center gap-4">
          {user.role !== UserRole.MEMBER && (
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
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-[11px] min-w-[1100px]">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedMetrics.map((m, idx) => {
                const prev = sortedMetrics[idx + 1];
                return (
                  <tr key={m.id || (m as any)._id} className="hover:bg-slate-50/50 transition-colors">
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
                  </tr>
                );
              })}
              {sortedMetrics.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-20 text-center text-slate-400 font-medium italic">Chưa có dữ liệu lịch sử đo lường</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MetricsManagement;
