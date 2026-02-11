
import React, { memo } from 'react';
import { HealthMetric } from '../../types.ts';

interface MetricConfig {
  key: string;
  label: string;
  color: string;
  inverse: boolean;
  icon: string;
}

interface StatCardsProps {
  latestMetric: HealthMetric | null;
  prevMetric: HealthMetric | null;
  configs: MetricConfig[];
}

const StatCards: React.FC<StatCardsProps> = ({ latestMetric, prevMetric, configs }) => {
  const getDiff = (key: keyof HealthMetric) => {
    if (!latestMetric || !prevMetric) return null;
    const current = latestMetric[key] as number;
    const previous = prevMetric[key] as number;
    if (typeof current !== 'number' || typeof previous !== 'number') return null;
    return current - previous;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {configs.map((metricInfo, i) => {
        const diff = getDiff(metricInfo.key as keyof HealthMetric);
        const isGood = diff !== null ? (metricInfo.inverse ? diff < 0 : diff > 0) : null;
        
        return (
          <div key={i} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm group hover:border-emerald-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{metricInfo.label}</span>
              <span className="text-xl group-hover:scale-125 transition-transform">
                {metricInfo.icon}
              </span>
            </div>
            <div className="text-2xl font-black flex items-baseline text-slate-800">
              {latestMetric ? latestMetric[metricInfo.key as keyof HealthMetric] : '--'} 
              <span className="text-[10px] font-bold text-slate-400 ml-1">
                {metricInfo.key === 'energy' ? 'kcal' : 
                 metricInfo.key === 'weight' || metricInfo.key === 'muscleMass' || metricInfo.key === 'boneMinerals' ? 'kg' :
                 metricInfo.key === 'bodyFat' || metricInfo.key === 'waterPercent' ? '%' : ''}
              </span>
            </div>
            
            {metricInfo.key === 'muscleMass' && latestMetric && latestMetric.weight > 0 && (
              <div className="text-[10px] font-black text-blue-500 mt-1 uppercase tracking-tighter">
                Tỷ lệ: {((latestMetric.muscleMass / latestMetric.weight) * 100).toFixed(1)}%
              </div>
            )}

            {diff !== null && diff !== 0 && (
              <div className={`text-[10px] font-black uppercase flex items-center gap-0.5 mt-2 ${isGood ? 'text-emerald-500' : 'text-rose-500'}`}>
                {diff > 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}
                <span className="ml-1 opacity-60">so với lần trước</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default memo(StatCards);
