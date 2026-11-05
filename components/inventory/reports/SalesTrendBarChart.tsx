import React, { memo, useCallback, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatVND } from '../../../utils/formatters.ts';
import { TrendBucket } from './reportHelpers.ts';

interface Props {
  data: TrendBucket[];
  rangeLabel: string;
}

const formatCompactCurrency = (value: number): string => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
};

const CustomBarTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const point: TrendBucket = payload[0].payload;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-xs shadow-xl backdrop-blur-sm">
      <div className="mb-1.5 font-black text-slate-800">{point.fullLabel}</div>
      <div className="space-y-1 text-slate-600">
        <div className="flex justify-between gap-4">
          <span>Doanh số:</span>
          <b className="text-emerald-700">{formatVND(point.sales)}</b>
        </div>
        <div className="flex justify-between gap-4">
          <span>Điểm PV:</span>
          <b className="text-teal-700">{point.pv} PV</b>
        </div>
        <div className="flex justify-between gap-4">
          <span>Số đơn / SP:</span>
          <b className="text-slate-900">{point.orders} đơn · {point.units} SP</b>
        </div>
        <div className="flex justify-between gap-4">
          <span>Lợi nhuận gộp:</span>
          <b className="text-indigo-700">{formatVND(point.profit)}</b>
        </div>
      </div>
    </div>
  );
};

const SalesTrendBarChart: React.FC<Props> = memo(({ data, rangeLabel }) => {
  const [metric, setMetric] = useState<'sales' | 'pv'>('sales');

  const selectSales = useCallback(() => {
    console.log('[SalesTrendBarChart] Metric switched to sales');
    setMetric('sales');
  }, []);

  const selectPv = useCallback(() => {
    console.log('[SalesTrendBarChart] Metric switched to pv');
    setMetric('pv');
  }, []);

  const hasNonZero = data.some(item => item.sales > 0 || item.pv > 0);

  return (
    <div className="flex flex-col rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6" data-testid="sales-trend-bar-chart">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900">📊 Biểu đồ biến động doanh số</h3>
          <p className="mt-1 text-xs text-slate-500">{rangeLabel}</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={selectSales}
            className={`rounded-lg px-3 py-1.5 transition ${
              metric === 'sales' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Doanh số (VNĐ)
          </button>
          <button
            type="button"
            onClick={selectPv}
            className={`rounded-lg px-3 py-1.5 transition ${
              metric === 'pv' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Điểm PV
          </button>
        </div>
      </div>

      <div className="mt-4 w-full" style={{ height: 320 }}>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                fontSize={11}
                tick={{ fill: '#475569', fontWeight: 700 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                fontSize={11}
                tick={{ fill: '#64748b', fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                width={58}
                tickFormatter={val => (metric === 'sales' ? formatCompactCurrency(Number(val)) : `${val} PV`)}
              />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }} />
              <Bar
                dataKey={metric}
                name={metric === 'sales' ? 'Doanh số' : 'Điểm PV'}
                fill={metric === 'sales' ? '#059669' : '#0284c7'}
                radius={[8, 8, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
            Chưa có dữ liệu thời gian.
          </div>
        )}
      </div>

      {!hasNonZero && data.length > 0 && (
        <p className="mt-2 text-center text-xs text-slate-400">
          Chưa phát sinh doanh số trong giai đoạn này.
        </p>
      )}
    </div>
  );
});

SalesTrendBarChart.displayName = 'SalesTrendBarChart';
export default SalesTrendBarChart;
