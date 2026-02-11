
import React, { memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HealthMetric } from '../../types.ts';
import { formatDateVN } from '../../utils/formatters.ts';

interface TrendChartProps {
  metrics: HealthMetric[];
  timeRange: string;
  setTimeRange: (range: string) => void;
  selectedMetricKeys: string[];
  toggleMetric: (key: string) => void;
  configs: any[];
}

const TIME_RANGES = [
  { key: '7d', label: '7 ngày' },
  { key: '14d', label: '2 tuần' },
  { key: '1m', label: '1 tháng' },
  { key: 'all', label: 'Tất cả' },
];

const TrendChart: React.FC<TrendChartProps> = ({ metrics, timeRange, setTimeRange, selectedMetricKeys, toggleMetric, configs }) => {
  return (
    <div className="lg:col-span-7 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[440px]">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
        <div>
          <h3 className="font-black text-slate-800 text-lg tracking-tight">Biểu đồ xu hướng</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sự thay đổi theo thời gian</p>
        </div>
        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
          {TIME_RANGES.map(range => (
            <button key={range.key} onClick={() => setTimeRange(range.key)} className={`px-3 py-1 text-[9px] font-black rounded-xl border transition-all ${timeRange === range.key ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-slate-50 text-slate-400 border-transparent'}`}>{range.label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {configs.map(m => (
          <button
            key={m.key}
            onClick={() => toggleMetric(m.key)}
            className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
              selectedMetricKeys.includes(m.key) 
              ? 'bg-white border-slate-200 text-slate-800 shadow-sm' 
              : 'bg-slate-50 border-transparent text-slate-300 opacity-60'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }}></span>
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex-grow w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metrics} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" fontSize={9} tick={{ fill: '#94a3b8', fontWeight: 700 }} tickFormatter={(v) => { const parts = v.split('-'); return `${parts[2]}/${parts[1]}`; }} axisLine={false} tickLine={false} />
            <YAxis fontSize={9} tick={{ fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={(v) => formatDateVN(v)} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
            {configs.filter(m => selectedMetricKeys.includes(m.key)).map(m => (
              <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={3} dot={{ r: 3 }} animationDuration={1000} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default memo(TrendChart);
