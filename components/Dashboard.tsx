
import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Sector 
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
  { key: 'weight', label: 'Cân nặng (kg)', short: 'Cân nặng', color: '#059669' },
  { key: 'bodyFat', label: 'Tỉ lệ mỡ (%)', short: 'Lượng mỡ', color: '#ef4444' },
  { key: 'waterPercent', label: 'Lượng nước (%)', short: 'Lượng nước', color: '#0ea5e9' },
  { key: 'muscleMass', label: 'Cơ bắp (kg)', short: 'Cơ bắp', color: '#3b82f6' },
  { key: 'bioAge', label: 'Tuổi sinh học', short: 'Tuổi SH', color: '#ec4899' },
  { key: 'visceralFat', label: 'Mỡ nội tạng', short: 'Mỡ NT', color: '#f59e0b' },
];

const TIME_RANGES = [
  { key: '7d', label: '7 ngày' },
  { key: '14d', label: '2 tuần' },
  { key: '1m', label: '1 tháng' },
  { key: '3m', label: '3 tháng' },
  { key: '6m', label: '6 tháng' },
  { key: '1y', label: '1 năm' },
  { key: 'all', label: 'Tất cả' },
];

const Dashboard: React.FC<DashboardProps> = ({ user, users, onAddMetric, refreshTrigger }) => {
  const [selectedUserId, setSelectedUserId] = useState((user as any).id || (user as any)._id);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [timeRange, setTimeRange] = useState('7d');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(['weight', 'bodyFat', 'waterPercent', 'muscleMass']);

  const selectedUser = useMemo(() => users.find(u => ((u as any).id || (u as any)._id) === selectedUserId) || user, [users, selectedUserId, user]);

  useEffect(() => {
    const load = async () => {
      const data = await Database.getMetrics(selectedUserId);
      setMetrics(data || []);
    };
    load();
  }, [selectedUserId, refreshTrigger]);

  const sortedMetrics = useMemo(() => [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [metrics]);
  const latestMetric = sortedMetrics[0] || null;
  const prevMetric = sortedMetrics[1] || null;

  const bmiInfo = useMemo(() => {
    if (!latestMetric || !selectedUser.height) return { value: 0, label: 'N/A', color: 'text-slate-400' };
    const bmi = latestMetric.weight / Math.pow(selectedUser.height / 100, 2);
    let label = 'Bình thường';
    let color = 'text-emerald-600';
    if (bmi < 18.5) { label = 'Thấp'; color = 'text-amber-500'; }
    else if (bmi >= 25 && bmi < 30) { label = 'Thừa cân'; color = 'text-orange-500'; }
    else if (bmi >= 30) { label = 'Béo phì'; color = 'text-red-500'; }
    return { value: bmi.toFixed(1), label, color };
  }, [latestMetric, selectedUser]);

  const renderTrend = (key: keyof HealthMetric, currentVal: number, compareVal?: number) => {
    if (compareVal === undefined || compareVal === null || currentVal === compareVal) return null;
    const diff = currentVal - compareVal;
    const isUp = diff > 0;
    const isGood = (key === 'weight' && selectedUser.healthGoal === HealthGoal.LOSE_WEIGHT) ? !isUp : isUp;
    return (
      <span className={`inline-flex items-center ml-1.5 text-[10px] font-black ${isGood ? 'text-emerald-500' : 'text-rose-500'}`}>
        {isUp ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}
      </span>
    );
  };

  const bodyCompData = useMemo(() => {
    if (!latestMetric) return [];
    return [
      { name: 'Cơ bắp', value: latestMetric.muscleMass || 0, color: '#3b82f6' },
      { name: 'Mỡ cơ thể', value: (latestMetric.weight * (latestMetric.bodyFat / 100)) || 0, color: '#f43f5e' },
      { name: 'Nước', value: (latestMetric.weight * (latestMetric.waterPercent / 100)) || 0, color: '#0ea5e9' },
    ];
  }, [latestMetric]);

  const filteredMetrics = useMemo(() => {
    const cutoff = new Date();
    if (timeRange.includes('m')) cutoff.setMonth(cutoff.getMonth() - parseInt(timeRange));
    else if (timeRange.includes('y')) cutoff.setFullYear(cutoff.getFullYear() - parseInt(timeRange));
    else cutoff.setDate(cutoff.getDate() - (parseInt(timeRange) || 3650));

    return metrics
      .filter(m => timeRange === 'all' || new Date(m.date) >= cutoff)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [metrics, timeRange]);

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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { key: 'weight', label: 'Cân nặng', value: latestMetric?.weight || '--', unit: 'kg', icon: '⚖️', color: 'text-slate-800' },
          { key: 'bmi', label: 'BMI', value: bmiInfo.value || '--', unit: '', icon: '📊', color: bmiInfo.color },
          { key: 'bodyFat', label: 'Tỉ lệ mỡ', value: latestMetric?.bodyFat || '--', unit: '%', icon: '🔥', color: 'text-rose-500' },
          { key: 'visceralFat', label: 'Mỡ nội tạng', value: latestMetric?.visceralFat || '--', unit: 'Lv', icon: '⚠️', color: 'text-amber-500' },
          { key: 'muscleMass', label: 'Cơ bắp', value: latestMetric?.muscleMass || '--', unit: 'kg', icon: '💪', color: 'text-blue-600' },
          { key: 'bioAge', label: 'Tuổi SH', value: latestMetric?.bioAge || '--', unit: 't', icon: '🧬', color: 'text-indigo-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
              <span className="text-lg group-hover:scale-125 transition-transform">{stat.icon}</span>
            </div>
            <div className={`text-xl font-black flex items-baseline ${stat.color}`}>
              {stat.value} <span className="text-[10px] font-bold text-slate-400 ml-0.5">{stat.unit}</span>
              {stat.key !== 'bmi' && latestMetric && prevMetric && renderTrend(stat.key as any, (latestMetric as any)[stat.key], (prevMetric as any)[stat.key])}
            </div>
          </div>
        ))}
      </div>

      <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex flex-col space-y-6 mb-8 items-center text-center">
          <div className="w-full">
            {/* Căn giữa tiêu đề, mở rộng ngang, ngăn xuống dòng */}
            <h3 className="font-black text-slate-800 text-lg md:text-xl tracking-tight whitespace-nowrap overflow-hidden text-center mx-auto max-w-full">
              Biểu đồ xu hướng sức khỏe hội viên Lucky Hub
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Hành trình thay đổi các chỉ số đo lường thực tế</p>
          </div>
          <div className="flex gap-1 overflow-x-auto no-scrollbar max-w-full px-2">
            {TIME_RANGES.map(range => (
              <button key={range.key} onClick={() => setTimeRange(range.key)} className={`px-3 py-1.5 text-[9px] font-black rounded-xl border shrink-0 transition-all ${timeRange === range.key ? 'bg-emerald-600 text-white shadow-md border-emerald-600' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-emerald-50'}`}>{range.label}</button>
            ))}
          </div>
        </div>

        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredMetrics} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" fontSize={9} tick={{ fill: '#94a3b8', fontWeight: 700 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; }} axisLine={false} tickLine={false} />
              <YAxis fontSize={9} tick={{ fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
              {AVAILABLE_METRICS.filter(m => selectedMetricKeys.includes(m.key)).map(m => (
                <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={3} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
