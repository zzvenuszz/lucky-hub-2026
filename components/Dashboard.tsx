
import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, PieChart, Pie, Cell, Sector 
} from 'recharts';
import { HealthMetric, User, UserRole } from '../types.ts';
import { Database } from '../services/database.ts';

interface DashboardProps {
  user: User;
  users: User[];
  onAddMetric: () => void;
}

// Cấu hình các chỉ số hỗ trợ vẽ biểu đồ
const AVAILABLE_METRICS = [
  { key: 'weight', label: 'Cân nặng (kg)', color: '#059669' },
  { key: 'bodyFat', label: 'Tỉ lệ mỡ (%)', color: '#ef4444' },
  { key: 'muscleMass', label: 'Khối lượng cơ (kg)', color: '#3b82f6' },
  { key: 'waterPercent', label: 'Tỉ lệ nước (%)', color: '#0ea5e9' },
  { key: 'visceralFat', label: 'Mỡ nội tạng (level)', color: '#f59e0b' },
  { key: 'energy', label: 'Chuyển hóa (kcal)', color: '#8b5cf6' },
  { key: 'boneMinerals', label: 'Xương (kg)', color: '#64748b' },
  { key: 'bioAge', label: 'Tuổi sinh học (tuổi)', color: '#ec4899' },
];

const TIME_RANGES = [
  { key: '7d', label: '7 ngày' },
  { key: '14d', label: '2 tuần' },
  { key: '1m', label: '1 tháng' },
  { key: '2m', label: '2 tháng' },
  { key: '3m', label: '3 tháng' },
  { key: '6m', label: '6 tháng' },
  { key: '1y', label: '1 năm' },
  { key: '2y', label: '2 năm' },
  { key: '3y', label: '3 năm' },
  { key: '5y', label: '5 năm' },
];

const Dashboard: React.FC<DashboardProps> = ({ user, users, onAddMetric }) => {
  const [selectedUserId, setSelectedUserId] = useState((user as any).id || (user as any)._id);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [timeRange, setTimeRange] = useState('1m');
  const [activeIndex, setActiveIndex] = useState(-1);
  
  // Mặc định chọn Cân nặng và Mỡ
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(['weight', 'bodyFat']);

  useEffect(() => {
    const load = async () => {
      const data = await Database.getMetrics(selectedUserId);
      setMetrics(data || []);
    };
    load();
  }, [selectedUserId]);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(-1);
  };

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 10}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          filter="url(#shadow)"
          style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
        />
      </g>
    );
  };

  const toggleMetric = (key: string) => {
    setSelectedMetricKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const latestMetric = useMemo(() => {
    if (metrics.length === 0) return null;
    return [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [metrics]);

  const bodyCompData = useMemo(() => {
    if (!latestMetric) return [];
    return [
      { name: 'Cơ bắp', value: latestMetric.muscleMass || 0, color: '#059669' },
      { name: 'Mỡ cơ thể', value: (latestMetric.weight * (latestMetric.bodyFat / 100)) || 0, color: '#f43f5e' },
      { name: 'Nước', value: (latestMetric.weight * (latestMetric.waterPercent / 100)) || 0, color: '#0ea5e9' },
    ];
  }, [latestMetric]);

  const filteredMetrics = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeRange) {
      case '7d': cutoff.setDate(now.getDate() - 7); break;
      case '14d': cutoff.setDate(now.getDate() - 14); break;
      case '1m': cutoff.setMonth(now.getMonth() - 1); break;
      case '2m': cutoff.setMonth(now.getMonth() - 2); break;
      case '3m': cutoff.setMonth(now.getMonth() - 3); break;
      case '6m': cutoff.setMonth(now.getMonth() - 6); break;
      case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
      case '2y': cutoff.setFullYear(now.getFullYear() - 2); break;
      case '3y': cutoff.setFullYear(now.getFullYear() - 3); break;
      case '5y': cutoff.setFullYear(now.getFullYear() - 5); break;
      default: cutoff.setMonth(now.getMonth() - 1);
    }

    return metrics
      .filter(m => new Date(m.date) >= cutoff)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [metrics, timeRange]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Lucky Hub Dashboard</h2>
          {user.role !== UserRole.MEMBER ? (
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-sm text-slate-500">Đang xem:</span>
              <select 
                value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                className="bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-lg border-none text-sm outline-none"
              >
                {users.map(u => <option key={(u as any).id || (u as any)._id} value={(u as any).id || (u as any)._id}>{u.fullName}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-slate-500">Chào {user.fullName}! Mục tiêu: <span className="text-emerald-600 font-semibold">{user.healthGoal}</span></p>
          )}
        </div>
        <button onClick={onAddMetric} className="bg-emerald-600 text-white px-6 py-2 rounded-xl shadow-lg font-bold hover:bg-emerald-700 transition-colors">+ Cập nhật chỉ số</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Biểu đồ tròn 3D Giả lập */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center">
          <h3 className="font-bold text-slate-700 mb-2 w-full text-center">Cấu trúc cơ thể hiện tại</h3>
          {latestMetric ? (
            <div className="w-full h-[280px] relative flex flex-col items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <filter id="shadow" height="130%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                      <feOffset dx="2" dy="4" result="offsetblur" />
                      <feComponentTransfer>
                        <feFuncA type="linear" slope="0.2" />
                      </feComponentTransfer>
                      <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <Pie
                    activeIndex={activeIndex}
                    activeShape={renderActiveShape}
                    data={bodyCompData}
                    cx="50%" cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                    filter="url(#shadow)"
                    onMouseEnter={onPieEnter}
                    onMouseLeave={onPieLeave}
                  >
                    {bodyCompData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`${value.toFixed(1)} kg`, 'Giá trị']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <div className="text-3xl font-black text-slate-800">{latestMetric.weight}<span className="text-xs ml-0.5">kg</span></div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tổng cân nặng</div>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-4">
                {bodyCompData.map(item => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="h-[280px] flex items-center justify-center text-slate-400 italic">Chưa có dữ liệu đo lường</div>}
        </div>

        {/* Biểu đồ đường xu hướng với Checkbox và Thời gian */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex flex-col space-y-4 mb-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-700 text-sm">Biểu đồ xu hướng sức khỏe</h3>
              <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-hide max-w-[70%]">
                {TIME_RANGES.map(range => (
                  <button 
                    key={range.key} onClick={() => setTimeRange(range.key)}
                    className={`whitespace-nowrap px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all border ${timeRange === range.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-100 hover:border-emerald-200'}`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bộ chọn chỉ số (Checkboxes) */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 p-3 bg-slate-50/50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase w-full mb-1">Chọn chỉ số hiển thị:</span>
              {AVAILABLE_METRICS.map(metric => (
                <label key={metric.key} className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 checked:border-transparent transition-all"
                      style={{ backgroundColor: selectedMetricKeys.includes(metric.key) ? metric.color : 'transparent' }}
                      checked={selectedMetricKeys.includes(metric.key)}
                      onChange={() => toggleMetric(metric.key)}
                    />
                    <svg className="absolute left-0 top-0 h-4 w-4 pointer-events-none hidden peer-checked:block text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className={`text-[11px] font-bold transition-colors ${selectedMetricKeys.includes(metric.key) ? 'text-slate-800' : 'text-slate-400 group-hover:text-slate-600'}`}>
                    {metric.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  fontSize={10} 
                  tick={{ fill: '#94a3b8' }} 
                  axisLine={false} 
                  tickLine={false} 
                  tickFormatter={(val) => {
                    const [y, m, d] = val.split('-');
                    return `${d}/${m}`;
                  }}
                />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  labelFormatter={(val) => `Ngày: ${val.split('-').reverse().join('/')}`}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', padding: '12px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '20px' }} />
                
                {AVAILABLE_METRICS.filter(m => selectedMetricKeys.includes(m.key)).map(m => (
                  <Line 
                    key={m.key}
                    type="monotone" 
                    dataKey={m.key} 
                    name={m.label} 
                    stroke={m.color} 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: m.color, strokeWidth: 2, stroke: '#fff' }} 
                    activeDot={{ r: 6, strokeWidth: 0 }} 
                    animationDuration={1000}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
