import React, { memo, useCallback, useMemo, useState } from 'react';
import { formatVND } from '../../../utils/formatters.ts';
import { StockReportItem, StockSummary } from './reportHelpers.ts';

interface Props {
  summary: StockSummary | null;
  items: StockReportItem[];
}

const PRICE_TIER_LABELS: Array<{ key: keyof StockSummary['estimated']; label: string }> = [
  { key: 'price100', label: 'Giá Lẻ (100%)' },
  { key: 'price25', label: 'Giá -25%' },
  { key: 'price35', label: 'Giá -35%' },
  { key: 'price42', label: 'Giá -42%' },
  { key: 'price50', label: 'Giá -50%' },
];

const STATUS_BADGE: Record<StockReportItem['stockStatus'], { label: string; className: string }> = {
  in_stock: { label: 'Đủ hàng', className: 'bg-emerald-100 text-emerald-800' },
  low_stock: { label: 'Tồn thấp', className: 'bg-amber-100 text-amber-800' },
  out_of_stock: { label: 'Hết hàng', className: 'bg-rose-100 text-rose-800' },
  archived: { label: 'Ngừng bán', className: 'bg-slate-200 text-slate-700' },
};

const StockReportSection: React.FC<Props> = memo(({ summary, items }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StockReportItem['stockStatus']>('all');

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(item => {
      if (item.categoryName) set.add(item.categoryName);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      if (selectedCategory !== 'all' && item.categoryName !== selectedCategory) return false;
      if (statusFilter !== 'all' && item.stockStatus !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${item.name} ${item.sku} ${(item.skus || []).join(' ')} ${item.categoryName}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, searchQuery, selectedCategory, statusFilter]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleCategoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    console.log('[StockReportSection] Filter category changed:', { category: val });
    setSelectedCategory(val);
  }, []);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as 'all' | StockReportItem['stockStatus'];
    console.log('[StockReportSection] Filter status changed:', { status: val });
    setStatusFilter(val);
  }, []);

  const filteredTotals = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        if (!item.archived) {
          acc.units += item.quantity;
          acc.pv = Number((acc.pv + item.totalPv).toFixed(2));
          acc.cost += item.costValue;
          acc.retail += item.retailValue;
        }
        return acc;
      },
      { units: 0, pv: 0, cost: 0, retail: 0 }
    );
  }, [filteredItems]);

  return (
    <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6" data-testid="stock-report-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900 sm:text-xl">📦 Báo cáo tồn kho</h3>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Thống kê chi tiết số lượng, điểm PV, giá vốn và giá trị ước tính của toàn bộ hàng hóa trong kho.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs font-bold uppercase text-slate-500">Mặt hàng đang bán</div>
          <div className="mt-2 text-xl font-black text-slate-900">{summary?.totalItems ?? 0}</div>
          <div className="mt-1 text-[11px] text-slate-500">Tổng {summary?.totalAllItems ?? 0} mặt hàng</div>
        </div>
        <div className="rounded-2xl bg-emerald-50/70 p-4">
          <div className="text-xs font-bold uppercase text-emerald-800">Tổng đơn vị tồn</div>
          <div className="mt-2 text-xl font-black text-emerald-900">{summary?.totalUnits ?? 0}</div>
          <div className="mt-1 text-[11px] text-emerald-700">{summary?.totalPv ?? 0} PV tồn kho</div>
        </div>
        <div className="rounded-2xl bg-indigo-50/70 p-4">
          <div className="text-xs font-bold uppercase text-indigo-800">Tổng giá vốn tồn</div>
          <div className="mt-2 break-words text-lg font-black text-indigo-900 sm:text-xl">
            {formatVND(summary?.totalCostValue ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-indigo-700">Theo lô nhập FIFO</div>
        </div>
        <div className="rounded-2xl bg-teal-50/70 p-4">
          <div className="text-xs font-bold uppercase text-teal-800">Giá trị lẻ ước tính</div>
          <div className="mt-2 break-words text-lg font-black text-teal-900 sm:text-xl">
            {formatVND(summary?.estimated?.price100 ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-teal-700">Theo mức giá 100%</div>
        </div>
        <div className="col-span-2 rounded-2xl bg-amber-50/70 p-4 sm:col-span-1">
          <div className="text-xs font-bold uppercase text-amber-800">Cảnh báo kho</div>
          <div className="mt-2 text-xl font-black text-amber-900">
            {(summary?.lowStockCount ?? 0) + (summary?.outOfStockCount ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-amber-800">
            {summary?.lowStockCount ?? 0} tồn thấp · {summary?.outOfStockCount ?? 0} hết hàng
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
        <div className="text-xs font-black uppercase tracking-wider text-slate-500">
          Ước tính giá trị tồn kho theo các mức chiết khấu
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PRICE_TIER_LABELS.map(tier => (
            <div key={tier.key} className="rounded-xl bg-white p-3 shadow-xs ring-1 ring-slate-200/70">
              <div className="text-[11px] font-bold text-slate-500">{tier.label}</div>
              <div className="mt-1 text-sm font-black text-slate-900">
                {formatVND(summary?.estimated?.[tier.key] ?? 0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Tìm theo tên sản phẩm hoặc mã SKU..."
          className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={selectedCategory}
          onChange={handleCategoryChange}
          aria-label="Lọc nhóm sản phẩm tồn kho"
          className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">Tất cả nhóm sản phẩm ({categories.length})</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={handleStatusChange}
          aria-label="Lọc trạng thái tồn kho"
          className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">Tất cả trạng thái ({items.length})</option>
          <option value="in_stock">Đủ hàng</option>
          <option value="low_stock">Tồn thấp</option>
          <option value="out_of_stock">Hết hàng</option>
          <option value="archived">Ngừng bán</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[780px] text-left text-xs sm:text-sm">
          <thead className="bg-slate-100 text-[11px] font-black uppercase text-slate-600">
            <tr>
              <th className="p-3">Sản phẩm / SKU</th>
              <th className="p-3">Nhóm SP</th>
              <th className="p-3 text-right">PV / SP</th>
              <th className="p-3 text-right">Số lượng tồn</th>
              <th className="p-3 text-right">Tổng PV tồn</th>
              <th className="p-3 text-right">Giá vốn tồn</th>
              <th className="p-3 text-right">Giá trị lẻ (100%)</th>
              <th className="p-3 text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => {
              const badge = STATUS_BADGE[item.stockStatus] || STATUS_BADGE.in_stock;
              return (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">{(item.skus?.length ? item.skus : [item.sku]).join(', ')}</div>
                  </td>
                  <td className="p-3 text-slate-600">{item.categoryName}</td>
                  <td className="p-3 text-right font-semibold">{item.pv}</td>
                  <td className="p-3 text-right font-black">
                    {item.quantity}
                    <span className="ml-1 text-[11px] font-normal text-slate-400">/ ngưỡng {item.lowStockThreshold}</span>
                  </td>
                  <td className="p-3 text-right font-bold text-emerald-700">{item.totalPv} PV</td>
                  <td className="p-3 text-right font-semibold text-slate-800">{formatVND(item.costValue)}</td>
                  <td className="p-3 text-right font-bold text-slate-900">{formatVND(item.retailValue)}</td>
                  <td className="p-3 text-center">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filteredItems.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-black text-slate-900">
              <tr>
                <td className="p-3" colSpan={3}>Tổng cộng ({filteredItems.length} mặt hàng đang lọc)</td>
                <td className="p-3 text-right">{filteredTotals.units}</td>
                <td className="p-3 text-right text-emerald-700">{filteredTotals.pv} PV</td>
                <td className="p-3 text-right">{formatVND(filteredTotals.cost)}</td>
                <td className="p-3 text-right">{formatVND(filteredTotals.retail)}</td>
                <td className="p-3"></td>
              </tr>
            </tfoot>
          )}
        </table>
        {!filteredItems.length && (
          <p className="p-8 text-center text-sm text-slate-500">Không có mặt hàng nào khớp bộ lọc tồn kho.</p>
        )}
      </div>
    </div>
  );
});

StockReportSection.displayName = 'StockReportSection';
export default StockReportSection;
