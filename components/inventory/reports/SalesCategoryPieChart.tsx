import React, { memo, useCallback, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatVND } from '../../../utils/formatters.ts';
import {
  CategoryBreakdownEntry,
  PIE_COLORS,
  PieGroupingMode,
  PieMetricMode,
  ProductBreakdownEntry,
} from './reportHelpers.ts';

interface Props {
  byProduct: ProductBreakdownEntry[];
  byCategory: CategoryBreakdownEntry[];
}

const CustomPieTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-xs shadow-xl backdrop-blur-sm">
      <div className="mb-1 font-black text-slate-900">{item.label}</div>
      {item.subLabel && <div className="mb-1.5 text-[11px] text-slate-500">{item.subLabel}</div>}
      <div className="space-y-1 text-slate-600">
        <div className="flex justify-between gap-4">
          <span>Doanh số:</span>
          <b className="text-emerald-700">{formatVND(item.sales)} ({item.salesPercent}%)</b>
        </div>
        <div className="flex justify-between gap-4">
          <span>Số lượng bán:</span>
          <b className="text-slate-900">{item.units} SP ({item.unitsPercent}%)</b>
        </div>
        <div className="flex justify-between gap-4">
          <span>Điểm PV:</span>
          <b className="text-teal-700">{item.pv} PV ({item.pvPercent}%)</b>
        </div>
      </div>
    </div>
  );
};

const SalesCategoryPieChart: React.FC<Props> = memo(({ byProduct, byCategory }) => {
  const [grouping, setGrouping] = useState<PieGroupingMode>('product');
  const [metric, setMetric] = useState<PieMetricMode>('sales');

  const handleGroupingProduct = useCallback(() => {
    console.log('[SalesCategoryPieChart] Grouping switched to product');
    setGrouping('product');
  }, []);

  const handleGroupingCategory = useCallback(() => {
    console.log('[SalesCategoryPieChart] Grouping switched to category');
    setGrouping('category');
  }, []);

  const handleMetricChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as PieMetricMode;
    console.log('[SalesCategoryPieChart] Metric changed:', { metric: next });
    setMetric(next);
  }, []);

  const chartData = useMemo(() => {
    const raw = grouping === 'product'
      ? byProduct.map(entry => ({
          id: entry.itemId,
          label: entry.name,
          subLabel: `${entry.sku} · ${entry.categoryName}`,
          sales: entry.sales,
          units: entry.units,
          pv: entry.pv,
          salesPercent: entry.salesPercent,
          unitsPercent: entry.unitsPercent,
          pvPercent: entry.pvPercent,
        }))
      : byCategory.map(entry => ({
          id: entry.categoryName,
          label: entry.categoryName,
          subLabel: '',
          sales: entry.sales,
          units: entry.units,
          pv: entry.pv,
          salesPercent: entry.salesPercent,
          unitsPercent: entry.unitsPercent,
          pvPercent: entry.pvPercent,
        }));

    const sorted = [...raw].sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0));
    return sorted.map((item, idx) => ({
      ...item,
      value: Number(item[metric] || 0),
      percent: metric === 'sales' ? item.salesPercent : metric === 'units' ? item.unitsPercent : item.pvPercent,
      color: PIE_COLORS[idx % PIE_COLORS.length],
    }));
  }, [byProduct, byCategory, grouping, metric]);

  return (
    <div className="flex flex-col rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6" data-testid="sales-category-pie-chart">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900">🥧 Tỉ lệ hàng bán ra</h3>
          <p className="mt-1 text-xs text-slate-500">
            Cơ cấu tỷ trọng theo từng mặt hàng hoặc theo nhóm sản phẩm.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={handleGroupingProduct}
              className={`rounded-lg px-3 py-1.5 transition ${
                grouping === 'product' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Từng mặt hàng
            </button>
            <button
              type="button"
              onClick={handleGroupingCategory}
              className={`rounded-lg px-3 py-1.5 transition ${
                grouping === 'category' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nhóm sản phẩm
            </button>
          </div>
          <select
            value={metric}
            onChange={handleMetricChange}
            aria-label="Tiêu chí tính tỉ lệ biểu đồ tròn"
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 outline-none"
          >
            <option value="sales">Theo doanh thu</option>
            <option value="units">Theo số lượng</option>
            <option value="pv">Theo điểm PV</option>
          </select>
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="mt-4 grid items-center gap-4 lg:grid-cols-[240px_1fr]">
          <div className="mx-auto w-full max-w-[240px]" style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={92}
                  paddingAngle={2}
                >
                  {chartData.map(entry => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {chartData.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-bold text-slate-900">{item.label}</div>
                    <div className="truncate text-[11px] text-slate-500">
                      {item.units} SP · {item.pv} PV{item.subLabel ? ` · ${item.subLabel}` : ''}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-black text-slate-900">{item.percent}%</div>
                  <div className="text-[11px] font-semibold text-emerald-700">{formatVND(item.sales)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex h-[230px] items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
          Chưa có sản phẩm bán ra trong giai đoạn này.
        </div>
      )}
    </div>
  );
});

SalesCategoryPieChart.displayName = 'SalesCategoryPieChart';
export default SalesCategoryPieChart;
