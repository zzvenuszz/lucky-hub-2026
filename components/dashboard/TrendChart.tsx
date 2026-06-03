import React, { memo, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
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

// Custom Tooltip component responsive
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-slate-100 shadow-xl px-4 py-3 max-w-[200px] sm:max-w-none">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">{formatDateVN(label)}</p>
      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-[11px] font-bold text-slate-700">{entry.name}:</span>
            <span className="text-[11px] font-black text-slate-900">{typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TrendChart: React.FC<TrendChartProps> = ({ metrics, timeRange, setTimeRange, selectedMetricKeys, toggleMetric, configs }) => {
  // Tự động tính domain YAxis dựa trên dữ liệu để hiển thị các mốc đẹp
  const yAxisConfigs = useMemo(() => {
    const result: Record<string, { domain: [number, number]; ticks: number[] }> = {};
    configs.filter(m => selectedMetricKeys.includes(m.key)).forEach(m => {
      const values = metrics.map(d => (d as any)[m.key]).filter((v: any) => v != null && !isNaN(v)) as number[];
      if (values.length === 0) return;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const padding = (max - min) * 0.15 || 1;
      const domainMin = Math.max(0, min - padding);
      const domainMax = max + padding;
      
      // Tạo ticks đẹp
      const range = domainMax - domainMin;
      const tickCount = 5;
      const rawStep = range / tickCount;
      const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const normalizedStep = rawStep / magnitude;
      let niceStep: number;
      if (normalizedStep <= 1.5) niceStep = 1 * magnitude;
      else if (normalizedStep <= 3.5) niceStep = 2 * magnitude;
      else if (normalizedStep <= 7.5) niceStep = 5 * magnitude;
      else niceStep = 10 * magnitude;
      
      const niceMin = Math.floor(domainMin / niceStep) * niceStep;
      const niceMax = Math.ceil(domainMax / niceStep) * niceStep;
      const ticks: number[] = [];
      for (let v = niceMin; v <= niceMax; v += niceStep) {
        ticks.push(Math.round(v * 100) / 100);
      }
      result[m.key] = { domain: [niceMin, niceMax], ticks };
    });
    return result;
  }, [metrics, selectedMetricKeys, configs]);

  // Dùng YAxis domain của metric đầu tiên được chọn
  const primaryKey = selectedMetricKeys.find(k => yAxisConfigs[k]) || selectedMetricKeys[0];
  const yConfig = primaryKey ? yAxisConfigs[primaryKey] : null;

  return (
    <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[480px] sm:min-h-[520px]">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6 sm:mb-8">
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
      
      {/* Metric toggle buttons - responsive: hide label on mobile */}
      <div className="flex flex-wrap gap-2 mb-6">
        {configs.map(m => (
          <button
            key={m.key}
            onClick={() => toggleMetric(m.key)}
            title={m.label}
            className={`px-2.5 sm:px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
              selectedMetricKeys.includes(m.key) 
              ? 'bg-white border-slate-200 text-slate-800 shadow-sm' 
              : 'bg-slate-50 border-transparent text-slate-300 opacity-60'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }}></span>
            <span className="text-sm leading-none">{m.icon}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-grow w-full" style={{ minHeight: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid 
              strokeDasharray="6 4" 
              vertical={false} 
              stroke="#cbd5e1" 
              strokeWidth={1}
            />
            <XAxis 
              dataKey="date" 
              fontSize={9} 
              tick={{ fill: '#94a3b8', fontWeight: 700 }} 
              tickFormatter={(v) => { 
                const parts = v.split('-'); 
                return `${parts[2]}/${parts[1]}`; 
              }} 
              axisLine={false} 
              tickLine={false} 
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis 
              fontSize={9} 
              tick={{ fill: '#94a3b8', fontWeight: 700 }} 
              axisLine={false} 
              tickLine={false}
              domain={yConfig ? yConfig.domain : ['auto', 'auto']}
              ticks={yConfig ? yConfig.ticks : undefined}
              width={55}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 3' }}
            />
            {configs.filter(m => selectedMetricKeys.includes(m.key)).map(m => (
              <Line 
                key={m.key} 
                type="monotone" 
                dataKey={m.key} 
                name={m.label} 
                stroke={m.color} 
                strokeWidth={2.5} 
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                animationDuration={800}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default memo(TrendChart);