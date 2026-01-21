
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
  refreshTrigger?: number; // Thêm trigger để làm mới dữ liệu
}

const AVAILABLE_METRICS = [
  { key: 'weight', label: 'Cân nặng (kg)', color: '#059669' },
  { key: 'bodyFat', label: 'Tỉ lệ mỡ (%)', color: '#ef4444' },
  { key: 'waterPercent', label: 'Lượng nước (%)', color: '#0ea5e9' },
  { key: 'muscleMass', label: 'Cơ bắp (kg)', color: '#3b82f6' },
  { key: 'bioAge', label: 'Tuổi sinh học', color: '#ec4899' },
  { key: 'visceralFat', label: 'Mỡ nội tạng', color: '#f59e0b' },
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

const Dashboard: React.FC<DashboardProps> = ({ user, users, onAddMetric, refreshTrigger }) => {
  const [selectedUserId, setSelectedUserId] = useState((user as any).id || (user as any)._id);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [timeRange, setTimeRange] = useState('7d');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(['weight', 'bodyFat']);

  const selectedUser = useMemo(() => users.find(u => ((u as any).id || (u as any)._id) === selectedUserId) || user, [users, selectedUserId, user]);

  // Làm mới khi ID người dùng đổi HOẶC khi có tín hiệu refreshTrigger từ App
  useEffect(() => {
    const load = async () => {
      const data = await Database.getMetrics(selectedUserId);
      setMetrics(data || []);
      if (window.debugLog) window.debugLog(`Dashboard đã cập nhật dữ liệu mới nhất cho: ${selectedUser.fullName}`, 'success');
    };
    load();
  }, [selectedUserId, refreshTrigger]);

  const latestMetric = useMemo(() => {
    if (metrics.length === 0) return null;
    return [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [metrics]);

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

  const onPieEnter = (_: any, index: number) => setActiveIndex(index);
  const onPieLeave = () => setActiveIndex(-1);

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector
          cx={cx} cy={cy}
          innerRadius={innerRadius - 4}
          outerRadius={outerRadius + 14}
          startAngle={startAngle} endAngle={endAngle}
          fill={fill}
          filter="url(#activeShadow)"
          style={{ 
            cursor: 'pointer', 
            outline: 'none',
            transition: 'all 1.2s cubic-bezier(0.19, 1, 0.22, 1)', 
            filter: 'brightness(1.08) contrast(1.05)',
          }}
        />
      </g>
    );
  };

  const toggleMetric = (key: string) => {
    setSelectedMetricKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
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
    const now = new Date();
    
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

  const tableData = useMemo(() => [...filteredMetrics].reverse(), [filteredMetrics]);

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER SECTION */}
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

      {/* QUICK STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Cân nặng', value: latestMetric?.weight || '--', unit: 'kg', icon: '⚖️', color: 'text-slate-800', desc: 'Lần đo cuối' },
          { label: 'Chỉ số BMI', value: bmiInfo.value || '--', unit: '', icon: '📊', color: bmiInfo.color, desc: bmiInfo.label },
          { label: 'Tỉ lệ mỡ', value: latestMetric?.bodyFat || '--', unit: '%', icon: '🔥', color: 'text-rose-500', desc: 'Mỡ cơ thể' },
          { label: 'Mỡ nội tạng', value: latestMetric?.visceralFat || '--', unit: 'Lv', icon: '⚠️', color: (latestMetric?.visceralFat || 0) > 9 ? 'text-red-500' : 'text-amber-500', desc: (latestMetric?.visceralFat || 0) > 9 ? 'Cần chú ý' : 'Bình thường' },
          { label: 'Cơ bắp', value: latestMetric?.muscleMass || '--', unit: 'kg', icon: '💪', color: 'text-blue-600', desc: 'Khối lượng cơ' },
          { label: 'Tuổi SH', value: latestMetric?.bioAge || '--', unit: 't', icon: '🧬', color: 'text-indigo-600', desc: `Chênh lệch: ${(latestMetric?.bioAge || 0) - (new Date().getFullYear() - new Date(selectedUser.birthDate).getFullYear())}t` },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
              <span className="text-lg group-hover:scale-125 transition-transform">{stat.icon}</span>
            </div>
            <div className={`text-2xl font-black ${stat.color}`}>
              {stat.value} <span className="text-xs font-bold text-slate-400">{stat.unit}</span>
            </div>
            <div className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{stat.desc}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
          <h3 className="font-bold text-slate-700 mb-2 w-full text-center">Cấu trúc cơ thể 3D</h3>
          {latestMetric ? (
            <div className="w-full h-[320px] relative flex flex-col items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart style={{ outline: 'none' }}>
                  <defs>
                    <filter id="shadow" height="150%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                      <feOffset dx="0" dy="4" result="offsetblur" />
                      <feComponentTransfer><feFuncA type="linear" slope="0.1" /></feComponentTransfer>
                      <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="activeShadow" height="150%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="10" />
                      <feOffset dx="0" dy="15" result="offsetblur" />
                      <feComponentTransfer><feFuncA type="linear" slope="0.3" /></feComponentTransfer>
                      <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <Pie
                    activeIndex={activeIndex}
                    activeShape={renderActiveShape}
                    data={bodyCompData}
                    cx="50%" cy="50%"
                    innerRadius={75} outerRadius={95}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                    filter="url(#shadow)"
                    onMouseEnter={onPieEnter}
                    onMouseLeave={onPieLeave}
                    animationBegin={0}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    style={{ outline: 'none' }}
                  >
                    {bodyCompData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} style={{ outline: 'none', transition: 'all 0.8s ease' }} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '12px' }}
                    itemStyle={{ fontWeight: '800', fontSize: '12px' }}
                    formatter={(value: number, name: string) => [`${value.toFixed(1)} kg`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <div className={`font-black transition-all duration-1000 ${activeIndex !== -1 ? 'text-4xl scale-110 text-emerald-600' : 'text-3xl text-slate-800'}`}>
                  {activeIndex !== -1 ? bodyCompData[activeIndex].value.toFixed(1) : latestMetric.weight}
                  <span className="text-xs ml-0.5">kg</span>
                </div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1 transition-all duration-1000">
                  {activeIndex !== -1 ? bodyCompData[activeIndex].name : 'Tổng cân'}
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-2">
                {bodyCompData.map((item, index) => (
                  <div key={item.name} className={`flex items-center gap-1.5 transition-all duration-700 ${activeIndex === index ? 'scale-110 opacity-100' : 'opacity-60'}`}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="h-[320px] flex items-center justify-center text-slate-400 italic font-medium">Chưa có dữ liệu đo lường</div>}
        </div>

        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col transition-all hover:shadow-md">
          <div className="flex flex-col space-y-8 mb-10">
            <div>
              <h3 className="font-black text-slate-800 text-xl tracking-tight">Biểu đồ xu hướng sức khỏe</h3>
              <p className="text-xs text-slate-400 font-medium mt-1">Phân tích dữ liệu lịch sử đo lường qua thời gian</p>
            </div>

            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Khoảng thời gian phân tích:</span>
              </div>
              <div className="flex overflow-x-auto gap-2 pb-4 scrollbar-hide no-scrollbar -mx-2 px-2">
                {TIME_RANGES.map(range => (
                  <button 
                    key={range.key} onClick={() => setTimeRange(range.key)}
                    className={`flex-1 min-w-[80px] px-4 py-3 text-[10px] font-black rounded-2xl transition-all border ${timeRange === range.key ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl shadow-emerald-100 scale-105' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-emerald-50 hover:text-emerald-600'}`}
                  >
                    {range.label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-5 bg-slate-50/50 rounded-[2rem] border border-slate-100 shadow-inner">
              <span className="text-[10px] font-black text-slate-400 uppercase col-span-full mb-1 tracking-widest text-center md:text-left">Chỉ số hiển thị:</span>
              {AVAILABLE_METRICS.map(metric => (
                <label key={metric.key} className="flex items-center gap-3 cursor-pointer group select-none">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border-2 border-slate-200 checked:border-transparent transition-all"
                      style={{ backgroundColor: selectedMetricKeys.includes(metric.key) ? metric.color : 'transparent' }}
                      checked={selectedMetricKeys.includes(metric.key)}
                      onChange={() => toggleMetric(metric.key)}
                    />
                    <svg className="absolute h-3.5 w-3.5 pointer-events-none hidden peer-checked:block text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className={`text-xs font-bold transition-all ${selectedMetricKeys.includes(metric.key) ? 'text-slate-800 translate-x-1' : 'text-slate-400 group-hover:text-slate-600'}`}>
                    {metric.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-[380px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  fontSize={10} 
                  tick={{ fill: '#94a3b8', fontWeight: 700 }} 
                  axisLine={false} 
                  tickLine={false} 
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  labelFormatter={(val) => `Ngày đo: ${new Date(val).toLocaleDateString('vi-VN')}`}
                  contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', padding: '20px' }}
                  itemStyle={{ fontWeight: '700' }}
                />
                <Legend 
                  iconType="circle" 
                  wrapperStyle={{ fontSize: '10px', fontWeight: '900', paddingTop: '40px', textTransform: 'uppercase', letterSpacing: '0.1em' }} 
                />
                
                {AVAILABLE_METRICS.filter(m => selectedMetricKeys.includes(m.key)).map(m => (
                  <Line 
                    key={m.key}
                    type="monotone" 
                    dataKey={m.key} 
                    name={m.label} 
                    stroke={m.color} 
                    strokeWidth={4} 
                    dot={{ r: 5, fill: m.color, strokeWidth: 3, stroke: '#fff' }} 
                    activeDot={{ r: 9, strokeWidth: 0, shadow: '0 0 15px rgba(0,0,0,0.2)' }} 
                    animationDuration={1500}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* DETAILED DATA TABLE SECTION */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-slate-800 text-xl tracking-tight">Nhật ký chỉ số chi tiết</h3>
            <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">
              Hiển thị {tableData.length} bản ghi trong khoảng {TIME_RANGES.find(r => r.key === timeRange)?.label}
            </p>
          </div>
          <div className="flex gap-2">
             <button className="px-4 py-2 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50 hover:text-emerald-600 transition-all">Xuất dữ liệu Excel</button>
          </div>
        </div>
        
        <div className="overflow-x-auto scrollbar-hide no-scrollbar max-h-[600px]">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50/90 backdrop-blur-md text-slate-400">
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100">Ngày đo</th>
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100 text-center">Cân nặng (kg)</th>
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100 text-center">Tỉ lệ mỡ (%)</th>
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100 text-center">Khối cơ (kg)</th>
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100 text-center">Xương (kg)</th>
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100 text-center">Nước (%)</th>
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100 text-center">Mỡ nội tạng</th>
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100 text-center">BMR (kcal)</th>
                <th className="p-5 font-black uppercase text-[10px] tracking-widest border-b border-slate-100 text-center">Tuổi SH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tableData.length > 0 ? tableData.map((row) => {
                const rowId = (row as any).id || (row as any)._id || 'N/A';
                return (
                  <tr key={rowId} className="group hover:bg-emerald-50/30 transition-all duration-300">
                    <td className="p-5">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-sm">{new Date(row.date).toLocaleDateString('vi-VN')}</span>
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">ID: {rowId !== 'N/A' ? rowId.toString().slice(-6) : 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      <span className="font-black text-emerald-600 text-base">{row.weight}</span>
                    </td>
                    <td className="p-5 text-center">
                      <span className={`font-bold text-sm ${row.bodyFat > 25 ? 'text-rose-500' : 'text-slate-600'}`}>{row.bodyFat}%</span>
                    </td>
                    <td className="p-5 text-center">
                      <span className="font-bold text-sm text-blue-600">{row.muscleMass} kg</span>
                    </td>
                    <td className="p-5 text-center">
                      <span className="font-bold text-sm text-amber-600">{row.boneMinerals} kg</span>
                    </td>
                    <td className="p-5 text-center">
                      <span className="font-bold text-sm text-sky-500">{row.waterPercent}%</span>
                    </td>
                    <td className="p-5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${row.visceralFat > 9 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                          Lv {row.visceralFat}
                        </span>
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      <span className="font-bold text-sm text-slate-600">{row.energy}</span>
                    </td>
                    <td className="p-5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-bold text-sm text-indigo-600">{row.bioAge}</span>
                        <span className="text-[10px] text-slate-400">t</span>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9} className="p-20 text-center">
                    <div className="flex flex-col items-center justify-center opacity-30">
                      <span className="text-5xl mb-4">📋</span>
                      <p className="font-black text-xs uppercase tracking-widest text-slate-500">Chưa có dữ liệu trong khoảng thời gian này</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {tableData.length > 0 && (
          <div className="p-6 bg-slate-50/50 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
              * Dữ liệu được sắp xếp theo thời gian mới nhất lên đầu và đồng bộ với bộ lọc phía trên
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
