
import React, { useMemo, useState, useCallback, memo } from 'react';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer, Sector } from 'recharts';
import { HealthMetric } from '../../types.ts';

interface BodyCompositionPieProps {
  latestMetric: HealthMetric | null;
}

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
        style={{ cursor: 'pointer' }}
      />
    </g>
  );
};

const BodyCompositionPie: React.FC<BodyCompositionPieProps> = ({ latestMetric }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const pieData = useMemo(() => {
    if (!latestMetric || !latestMetric.weight) return [];
    const weight = latestMetric.weight;
    const fatMass = Number((weight * (latestMetric.bodyFat / 100)).toFixed(1));
    const waterMass = Number((weight * (latestMetric.waterPercent / 100)).toFixed(1));
    const minerals = latestMetric.boneMinerals || 0;
    const muscle = latestMetric.muscleMass || 0;

    return [
      { name: 'Cơ bắp', value: muscle, color: '#ef4444' },
      { name: 'Nước', value: waterMass, color: '#0ea5e9' },
      { name: 'Mỡ', value: fatMass, color: '#fde047' },
      { name: 'Khoáng', value: minerals, color: '#94a3b8' },
    ];
  }, [latestMetric]);

  const onPieEnter = useCallback((_: any, index: number) => { setActiveIndex(index); }, []);
  const onPieLeave = useCallback(() => { setActiveIndex(null); }, []);

  return (
    <div className="lg:col-span-5 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[440px] relative">
      <div className="mb-2">
        <h3 className="font-black text-slate-800 text-lg tracking-tight">Cấu trúc cơ thể</h3>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">🍀Trợ lý Lucky phân tích: Cơ, Nước, Mỡ, Khoáng</p>
      </div>
      <div className="flex-grow flex items-center justify-center relative">
        {latestMetric ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 select-none">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-80 text-center px-4">
                {activeIndex !== null ? pieData[activeIndex].name : 'Tổng cân'}
              </span>
              <span className="text-3xl font-black text-slate-800 tabular-nums">
                {activeIndex !== null 
                  ? `${((pieData[activeIndex].value / latestMetric.weight) * 100).toFixed(1)}%` 
                  : `${latestMetric.weight}kg`
                }
              </span>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <PieChart>
                <Pie 
                  {...({ activeIndex: activeIndex === null ? undefined : activeIndex, activeShape: renderActiveShape } as any)}
                  data={pieData} cx="50%" cy="50%" innerRadius={80} outerRadius={100} paddingAngle={5} 
                  dataKey="value" onMouseEnter={onPieEnter} onMouseLeave={onPieLeave} stroke="none" 
                  animationBegin={0} animationDuration={1500}
                >
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-slate-300 italic text-sm font-black uppercase tracking-widest">Chưa có dữ liệu</div>
        )}
      </div>
      {latestMetric && (
        <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-[9px] text-slate-500 font-bold leading-relaxed italic">(*) Giải thích: Tổng tỷ lệ có thể khác 100% do sự giao thoa tự nhiên.</p>
        </div>
      )}
    </div>
  );
};

export default memo(BodyCompositionPie);
