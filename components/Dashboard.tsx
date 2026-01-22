
import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { HealthMetric, User, UserRole, HealthGoal } from '../types.ts';
import { Database } from '../services/database.ts';

interface DashboardProps {
  user: User;
  users: User[];
  onAddMetric: () => void;
  refreshTrigger?: number;
}

const AVAILABLE_METRICS = [
  { key: 'weight', label: 'Cân nặng (kg)', color: '#059669' },
  { key: 'bodyFat', label: 'Tỉ lệ mỡ (%)', color: '#ef4444' },
  { key: 'waterPercent', label: 'Lượng nước (%)', color: '#0ea5e9' },
  { key: 'muscleMass', label: 'Cơ bắp (kg)', color: '#3b82f6' },
  { key: 'balanceIndex', label: 'Cân đối', color: '#8b5cf6' },
  { key: 'bioAge', label: 'Tuổi sinh học', color: '#ec4899' },
  { key: 'visceralFat', label: 'Mỡ nội tạng', color: '#f59e0b' },
];

const TIME_RANGES = [
  { key: '7d', label: '7 ngày' },
  { key: '14d', label: '2 tuần' },
  { key: '1m', label: '1 tháng' },
  { key: 'all', label: 'Tất cả' },
];

const formatDateVN = (dateStr: string) => {
  if (!dateStr) return '--/--/----';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  } catch {
    return dateStr;
  }
};

const Dashboard: React.FC<DashboardProps> = ({ user, users, onAddMetric, refreshTrigger }) => {
  const [selectedUserId, setSelectedUserId] = useState((user as any).id || (user as any)._id);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(['weight', 'bodyFat', 'muscleMass']);

  useEffect(() => {
    const load = async () => {
      const data = await Database.getMetrics(selectedUserId);
      setMetrics(data || []);
    };
    load();
  }, [selectedUserId, refreshTrigger]);

  const sortedMetrics = useMemo(() => [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [metrics]);
  const latestMetric = sortedMetrics[0] || null;

  // Dữ liệu cho biểu đồ tròn (Pie Chart) - Phân tích cấu trúc
  const pieData = useMemo(() => {
    if (!latestMetric) return [];
    
    const fatMass = Number((latestMetric.weight * (latestMetric.bodyFat / 100)).toFixed(1));
    const muscle = latestMetric.muscleMass || 0;
    const bone = latestMetric.boneMinerals || 0;
    // Phần còn lại (Nước và các mô khác không nằm trong cơ/xương)
    const others = Math.max(0, Number((latestMetric.weight - fatMass - muscle - bone).toFixed(1)));

    return [
      { name: 'Mỡ cơ thể', value: fatMass, color: '#ef4444' },
      { name: 'Khối lượng cơ', value: muscle, color: '#3b82f6' },
      { name: 'Khối lượng xương', value: bone, color: '#f59e0b' },
      { name: 'Thành phần khác', value: others, color: '#94a3b8' },
    ];
  }, [latestMetric]);

  const filteredMetrics = useMemo(() => {
    const cutoff = new Date();
    if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7);
    else if (timeRange === '14d') cutoff.setDate(cutoff.getDate() - 14);
    else if (timeRange === '1m') cutoff.setMonth(cutoff.getMonth() - 1);
    else return [...metrics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return metrics
      .filter(m => new Date(m.date) >= cutoff)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [metrics, timeRange]);

  const renderTrendIcon = (current: number, prev?: number, inverse = false) => {
    if (prev === undefined || current === prev) return null;
    const isUp = current > prev;
    const isGood = inverse ? !isUp : isUp;
    return <span className={isGood ? 'text-emerald-500' : 'text-rose-500'}>{isUp ? '↑' : '↓'}</span>;
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Lucky Hub Dashboard</h2>
          {user.role !== UserRole.MEMBER ? (
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-sm text-slate-500 font-medium">Hội viên:</span>
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="bg-emerald-50 text-emerald-700 font-bold px-3 py-1.5 rounded-xl border-none text-sm outline-none ring-1 ring-emerald-100">
                {users.map(u => <option key={(u as any).id || (u as any)._id} value={(u as any).id || (u as any)._id}>{u.fullName}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-slate-500 font-medium">Chào {user.fullName}! Mục tiêu: <span className="text-emerald-600 font-bold">{user.healthGoal}</span></p>
          )}
        </div>
        <button onClick={onAddMetric} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-emerald-100 font-bold hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all">+ Cập nhật chỉ số</button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { key: 'weight', label: 'Cân nặng', value: latestMetric?.weight || '--', unit: 'kg', icon: '⚖️', color: 'text-slate-800' },
          { key: 'bodyFat', label: 'Tỉ lệ mỡ', value: latestMetric?.bodyFat || '--', unit: '%', icon: '🔥', color: 'text-rose-500' },
          { key: 'balanceIndex', label: 'Cân đối', value: latestMetric?.balanceIndex ?? '--', unit: 'pt', icon: '💎', color: 'text-indigo-600' },
          { key: 'muscleMass', label: 'Cơ bắp', value: latestMetric?.muscleMass || '--', unit: 'kg', icon: '💪', color: 'text-blue-600' },
          { key: 'visceralFat', label: 'Mỡ nội tạng', value: latestMetric?.visceralFat || '--', unit: 'Lv', icon: '⚠️', color: 'text-amber-500' },
          { key: 'bioAge', label: 'Tuổi SH', value: latestMetric?.bioAge || '--', unit: 't', icon: '🧬', color: 'text-indigo-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
              <span className="text-lg group-hover:scale-125 transition-transform">{stat.icon}</span>
            </div>
            <div className={`text-xl font-black flex items-baseline ${stat.color}`}>
              {stat.value} <span className="text-[10px] font-bold text-slate-400 ml-0.5">{stat.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Biểu đồ Tròn Cấu trúc (KHÔI PHỤC) */}
        <div className="lg:col-span-5 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[400px]">
          <div className="mb-2">
            <h3 className="font-black text-slate-800 text-lg tracking-tight">Cấu trúc cơ thể</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Phân bổ khối lượng (kg)</p>
          </div>
          <div className="flex-grow flex items-center justify-center">
            {latestMetric ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`${value} kg`, 'Khối lượng']}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-300 italic text-sm">Chưa có dữ liệu</div>
            )}
          </div>
          {latestMetric && (
            <div className="mt-4 pt-4 border-t border-slate-50 text-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng trọng lượng: </span>
              <span className="text-sm font-black text-slate-800">{latestMetric.weight} kg</span>
            </div>
          )}
        </div>

        {/* Biểu đồ Xu hướng */}
        <div className="lg:col-span-7 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="font-black text-slate-800 text-lg tracking-tight">Biểu đồ xu hướng</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sự thay đổi theo thời gian</p>
            </div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {TIME_RANGES.map(range => (
                <button key={range.key} onClick={() => setTimeRange(range.key)} className={`px-3 py-1 text-[9px] font-black rounded-xl border transition-all ${timeRange === range.key ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-slate-50 text-slate-400 border-transparent'}`}>{range.label}</button>
              ))}
            </div>
          </div>

          <div className="flex-grow w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredMetrics} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={9} tick={{ fill: '#94a3b8', fontWeight: 700 }} tickFormatter={(v) => { const parts = v.split('-'); return `${parts[2]}/${parts[1]}`; }} axisLine={false} tickLine={false} />
                <YAxis fontSize={9} tick={{ fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(v) => formatDateVN(v)} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                {AVAILABLE_METRICS.filter(m => selectedMetricKeys.includes(m.key)).map(m => (
                  <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={3} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Lịch sử chi tiết */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
          <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Lịch sử chỉ số chi tiết (DD/MM/YYYY)</h3>
          {latestMetric && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">Lần đo mới nhất: {formatDateVN(latestMetric.date)}</span>}
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-[11px] min-w-[1000px]">
            <thead className="bg-white border-b border-slate-50">
              <tr className="text-slate-400 font-black uppercase tracking-widest">
                <th className="p-4">Ngày đo</th>
                <th className="p-4">Cân (kg)</th>
                <th className="p-4">Mỡ (%)</th>
                <th className="p-4">Cơ (kg)</th>
                <th className="p-4">Cân đối</th>
                <th className="p-4">Xương (kg)</th>
                <th className="p-4">Nước (%)</th>
                <th className="p-4">Mỡ nội tạng</th>
                <th className="p-4">BMR (kcal)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedMetrics.map((m, idx) => {
                const prev = sortedMetrics[idx + 1];
                return (
                  <tr key={m.id || (m as any)._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-700">{formatDateVN(m.date)}</td>
                    <td className="p-4 font-black text-emerald-600">{m.weight} {renderTrendIcon(m.weight, prev?.weight)}</td>
                    <td className="p-4 font-bold text-rose-500">{m.bodyFat}% {renderTrendIcon(m.bodyFat, prev?.bodyFat, true)}</td>
                    <td className="p-4 font-bold text-blue-600">{m.muscleMass} {renderTrendIcon(m.muscleMass, prev?.muscleMass)}</td>
                    <td className="p-4 font-black text-indigo-600">{m.balanceIndex ?? 0}</td>
                    <td className="p-4 text-slate-600">{m.boneMinerals || '--'}</td>
                    <td className="p-4 text-sky-600">{m.waterPercent}%</td>
                    <td className="p-4 font-bold text-amber-600">{m.visceralFat || '--'}</td>
                    <td className="p-4 text-slate-500">{m.energy || '--'}</td>
                  </tr>
                );
              })}
              {sortedMetrics.length === 0 && (
                <tr><td colSpan={9} className="p-10 text-center text-slate-400 font-medium">Chưa có dữ liệu lịch sử</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
