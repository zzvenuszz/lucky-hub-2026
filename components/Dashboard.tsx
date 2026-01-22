
import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, PieChart, Pie, Cell, Sector 
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
  // Thiết lập các chỉ số mặc định: Cân nặng, Mỡ, Nước, Cơ bắp
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
    if (bmi < 18.5) { label = 'Cân nặng thấp'; color = 'text-amber-500'; }
    else if (bmi >= 25 && bmi < 30) { label = 'Thừa cân'; color = 'text-orange-500'; }
    else if (bmi >= 30) { label = 'Béo phì'; color = 'text-red-500'; }
    return { value: bmi.toFixed(1), label, color };
  }, [latestMetric, selectedUser]);

  const renderTrend = (key: keyof HealthMetric, currentVal: number, compareVal?: number) => {
    if (compareVal === undefined || compareVal === null || currentVal === compareVal) return null;
    
    const diff = currentVal - compareVal;
    const isUp = diff > 0;
    const absDiff = Math.abs(diff).toFixed(1);
    
    let isGood = false;
    const goal = selectedUser.healthGoal;

    if (key === 'weight') {
      if (goal === HealthGoal.LOSE_WEIGHT) isGood = !isUp;
      else if (goal === HealthGoal.GAIN_WEIGHT) isGood = isUp;
      else isGood = !isUp;
    } else if (key === 'bodyFat') {
      isGood = !isUp;
    } else if (key === 'muscleMass') {
      isGood = isUp;
    } else if (key === 'waterPercent') {
      isGood = isUp;
    } else if (key === 'bioAge' || key === 'visceralFat') {
      isGood = !isUp;
    }

    const colorClass = isGood ? 'text-emerald-500' : 'text-rose-500';
    const icon = isUp ? '↑' : '↓';
    const sign = isUp ? '+' : '-';

    return (
      <span className={`inline-flex items-center ml-1.5 text-[10px] font-black ${colorClass} opacity-90`}>
        {icon} {sign}{absDiff}
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
    if (timeRange === 'all') return [...metrics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const cutoff = new Date();
    const days = parseInt(timeRange) || 7;
    if (timeRange.includes('m')) cutoff.setMonth(cutoff.getMonth() - parseInt(timeRange));
    else if (timeRange.includes('y')) cutoff.setFullYear(cutoff.getFullYear() - parseInt(timeRange));
    else cutoff.setDate(cutoff.getDate() - days);

    return metrics
      .filter(m => new Date(m.date) >= cutoff)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [metrics, timeRange]);

  const tableData = useMemo(() => [...filteredMetrics].reverse(), [filteredMetrics]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Lucky Hub Dashboard</h2>
          {user.role !== UserRole.MEMBER ? (
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-sm text-slate-500 font-medium">Đang theo dõi:</span>
              <select 
                value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                className="bg-emerald-50 text-emerald-700 font-bold px-3 py-1.5 rounded-xl border-none text-sm outline-none ring-1 ring-emerald-100 focus:ring-2 focus:ring-emerald-400 transition-all"
              >
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
          { key: 'bmi', label: 'Chỉ số BMI', value: bmiInfo.value || '--', unit: '', icon: '📊', color: bmiInfo.color },
          { key: 'bodyFat', label: 'Tỉ lệ mỡ', value: latestMetric?.bodyFat || '--', unit: '%', icon: '🔥', color: 'text-rose-500' },
          { key: 'visceralFat', label: 'Mỡ nội tạng', value: latestMetric?.visceralFat || '--', unit: 'Lv', icon: '⚠️', color: (latestMetric?.visceralFat || 0) > 9 ? 'text-red-500' : 'text-amber-500' },
          { key: 'muscleMass', label: 'Cơ bắp', value: latestMetric?.muscleMass || '--', unit: 'kg', icon: '💪', color: 'text-blue-600' },
          { key: 'bioAge', label: 'Tuổi SH', value: latestMetric?.bioAge || '--', unit: 't', icon: '🧬', color: 'text-indigo-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
              <span className="text-lg group-hover:scale-125 transition-transform">{stat.icon}</span>
            </div>
            <div className={`text-xl font-black flex items-baseline ${stat.color}`}>
              {stat.value} 
              <span className="text-[10px] font-bold text-slate-400 ml-0.5">{stat.unit}</span>
              {stat.key !== 'bmi' && latestMetric && prevMetric && renderTrend(stat.key as any, (latestMetric as any)[stat.key], (prevMetric as any)[stat.key])}
            </div>
            <div className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
               {stat.key === 'bmi' ? bmiInfo.label : stat.key === 'bioAge' ? `Thực tế: ${new Date().getFullYear() - new Date(selectedUser.birthDate).getFullYear()}t` : 'So với lần trước'}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
          <h3 className="font-bold text-slate-700 mb-2 w-full text-center text-sm uppercase tracking-widest">Cấu trúc cơ thể 3D</h3>
          {latestMetric ? (
            <div className="w-full h-[300px] relative flex flex-col items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {/* Fix: Sử dụng casting as any để giải quyết lỗi types cho Pie activeIndex/activeShape trong một số phiên bản Recharts */}
                  <Pie
                    activeIndex={activeIndex as any}
                    activeShape={((props: any) => {
                      const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                      return (
                        <g><Sector cx={cx} cy={cy} innerRadius={innerRadius - 4} outerRadius={outerRadius + 10} startAngle={startAngle} endAngle={endAngle} fill={fill} /></g>
                      );
                    }) as any}
                    data={bodyCompData}
                    cx="50%" cy="50%"
                    innerRadius={65} outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(-1)}
                  >
                    {bodyCompData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(1)} kg`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[48%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <div className={`font-black text-2xl ${activeIndex !== -1 ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {activeIndex !== -1 ? bodyCompData[activeIndex].value.toFixed(1) : latestMetric.weight}
                  <span className="text-[10px] ml-0.5">kg</span>
                </div>
                <div className="text-[8px] text-slate-400 font-black uppercase tracking-widest">
                  {activeIndex !== -1 ? bodyCompData[activeIndex].name : 'Tổng cân'}
                </div>
              </div>
            </div>
          ) : <div className="h-[300px] flex items-center justify-center text-slate-400 italic text-xs uppercase tracking-widest">Chưa có dữ liệu</div>}
        </div>

        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex flex-col space-y-6 mb-8">
            <div className="flex justify-between items-end gap-2">
              <div>
                <h3 className="font-black text-slate-800 text-lg tracking-tight">Biểu đồ xu hướng</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Lịch sử thay đổi chỉ số</p>
              </div>
              <div className="flex gap-1 overflow-x-auto no-scrollbar max-w-full">
                {TIME_RANGES.map(range => (
                  <button 
                    key={range.key} onClick={() => setTimeRange(range.key)}
                    className={`px-3 py-1.5 text-[9px] font-black rounded-xl transition-all border shrink-0 ${timeRange === range.key ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-emerald-50'}`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Cải thiện hiển thị các nút chọn chỉ số */}
            <div className="flex flex-wrap gap-2 md:gap-3 p-1">
              {AVAILABLE_METRICS.map(m => (
                <label key={m.key} className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl border transition-all ${selectedMetricKeys.includes(m.key) ? 'bg-white border-slate-200 shadow-sm ring-1 ring-slate-100' : 'bg-slate-50 border-transparent opacity-60 grayscale hover:grayscale-0 hover:opacity-100'}`}>
                  <input 
                    type="checkbox" className="hidden"
                    checked={selectedMetricKeys.includes(m.key)}
                    onChange={() => setSelectedMetricKeys(prev => prev.includes(m.key) ? prev.filter(k => k !== m.key) : [...prev, m.key])}
                  />
                  <div className={`w-3 h-3 rounded-full transition-transform ${selectedMetricKeys.includes(m.key) ? 'scale-110' : 'scale-100'}`} style={{ backgroundColor: m.color }}></div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${selectedMetricKeys.includes(m.key) ? 'text-slate-800' : 'text-slate-400'}`}>{m.short}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredMetrics} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={9} tick={{ fill: '#94a3b8', fontWeight: 700 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; }} axisLine={false} tickLine={false} />
                <YAxis fontSize={9} tick={{ fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: '11px' }} />
                {AVAILABLE_METRICS.filter(m => selectedMetricKeys.includes(m.key)).map(m => (
                  <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={3} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Nhật ký chi tiết</h3>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">{tableData.length} bản ghi</span>
        </div>
        
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50 text-[9px] font-black uppercase text-slate-400 tracking-[0.15em]">
                <th className="p-4 border-b">Ngày</th>
                <th className="p-4 border-b text-center">Cân nặng (kg)</th>
                <th className="p-4 border-b text-center">Mỡ (%)</th>
                <th className="p-4 border-b text-center">Cơ (kg)</th>
                <th className="p-4 border-b text-center">Xương (kg)</th>
                <th className="p-4 border-b text-center">Nước (%)</th>
                <th className="p-4 border-b text-center">Mỡ NT</th>
                <th className="p-4 border-b text-center">BMR</th>
                <th className="p-4 border-b text-center">Tuổi SH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tableData.map((row, idx) => {
                const nextRow = tableData[idx + 1];
                return (
                  <tr key={(row as any)._id || idx} className="hover:bg-emerald-50/20 transition-colors">
                    <td className="p-4">
                      <div className="text-xs font-bold text-slate-700">{new Date(row.date).toLocaleDateString('vi-VN')}</div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="text-sm font-black text-slate-800">
                        {row.weight}
                        {renderTrend('weight', row.weight, nextRow?.weight)}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="text-xs font-bold text-slate-600">
                        {row.bodyFat}%
                        {renderTrend('bodyFat', row.bodyFat, nextRow?.bodyFat)}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="text-xs font-bold text-slate-600">
                        {row.muscleMass}
                        {renderTrend('muscleMass', row.muscleMass, nextRow?.muscleMass)}
                      </div>
                    </td>
                    <td className="p-4 text-center text-xs text-slate-500 font-medium">{row.boneMinerals}</td>
                    <td className="p-4 text-center">
                      <div className="text-xs font-bold text-slate-600">
                        {row.waterPercent}%
                        {renderTrend('waterPercent', row.waterPercent, nextRow?.waterPercent)}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="text-xs font-bold text-slate-600">
                        {row.visceralFat}
                        {renderTrend('visceralFat', row.visceralFat, nextRow?.visceralFat)}
                      </div>
                    </td>
                    <td className="p-4 text-center text-xs text-slate-500">{row.energy}</td>
                    <td className="p-4 text-center">
                      <div className="text-xs font-bold text-slate-600">
                        {row.bioAge}
                        {renderTrend('bioAge', row.bioAge, nextRow?.bioAge)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;