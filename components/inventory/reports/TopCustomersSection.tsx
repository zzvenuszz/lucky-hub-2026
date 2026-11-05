import React, { memo, useCallback, useMemo, useState } from 'react';
import { formatVND } from '../../../utils/formatters.ts';
import {
  CustomerSortField,
  TopCustomerEntry,
  TopCustomerPeriodType,
} from './reportHelpers.ts';

interface Props {
  customers: TopCustomerEntry[];
  rangeLabel: string;
  topPeriod: TopCustomerPeriodType;
  onTopPeriodChange: (period: TopCustomerPeriodType) => void;
  onOpenMemberPurchases: (memberId: string) => void;
  onApplyBuyerFilter: (buyerSearch: string) => void;
}

const PERIOD_OPTIONS: Array<{ id: TopCustomerPeriodType; label: string }> = [
  { id: 'year', label: 'Theo năm' },
  { id: 'month', label: 'Theo tháng' },
  { id: 'quarter', label: 'Theo quý' },
  { id: 'herbalife_fy', label: 'Năm TC Herbalife' },
  { id: 'sync', label: 'Theo kỳ báo cáo chung' },
];

const TopCustomersSection: React.FC<Props> = memo(({
  customers,
  rangeLabel,
  topPeriod,
  onTopPeriodChange,
  onOpenMemberPurchases,
  onApplyBuyerFilter,
}) => {
  const [sortBy, setSortBy] = useState<CustomerSortField>('sales');

  const handlePeriodClick = useCallback(
    (period: TopCustomerPeriodType) => {
      console.log('[TopCustomersSection] Period changed:', { period });
      onTopPeriodChange(period);
    },
    [onTopPeriodChange]
  );

  const handleSortSales = useCallback(() => {
    console.log('[TopCustomersSection] Sort changed to sales');
    setSortBy('sales');
  }, []);

  const handleSortPv = useCallback(() => {
    console.log('[TopCustomersSection] Sort changed to pv');
    setSortBy('pv');
  }, []);

  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => {
      if (sortBy === 'pv') {
        return b.pv - a.pv || b.sales - a.sales;
      }
      return b.sales - a.sales || b.pv - a.pv;
    });
  }, [customers, sortBy]);

  return (
    <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6" data-testid="top-customers-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900 sm:text-xl">🏆 Top khách hàng mua nhiều nhất</h3>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Kỳ thống kê: <b className="text-slate-700">{rangeLabel}</b> · Sắp xếp theo tổng tiền hàng hoặc tổng điểm PV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 text-xs font-bold">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handlePeriodClick(opt.id)}
                className={`rounded-lg px-3 py-1.5 transition ${
                  topPeriod === opt.id ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={handleSortSales}
              className={`rounded-lg px-3 py-1.5 transition ${
                sortBy === 'sales' ? 'bg-indigo-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sắp xếp: Tổng tiền hàng
            </button>
            <button
              type="button"
              onClick={handleSortPv}
              className={`rounded-lg px-3 py-1.5 transition ${
                sortBy === 'pv' ? 'bg-indigo-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sắp xếp: Tổng điểm PV
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {sortedCustomers.map((customer, index) => {
          const rank = index + 1;
          const rankStyle =
            rank === 1
              ? 'bg-amber-400 text-amber-950'
              : rank === 2
              ? 'bg-slate-300 text-slate-900'
              : rank === 3
              ? 'bg-orange-300 text-orange-950'
              : 'bg-slate-100 text-slate-600';

          return (
            <div
              key={customer.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 transition hover:border-emerald-200 hover:bg-emerald-50/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-black ${rankStyle}`}>
                  #{rank}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="truncate text-sm text-slate-900">{customer.buyerName}</b>
                    {customer.memberNumber && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        Mã TV: {customer.memberNumber}
                      </span>
                    )}
                    {!customer.buyerUserId && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        Khách lẻ
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {customer.orders} đơn hàng · {customer.units} sản phẩm
                    {customer.buyerPhone ? ` · SĐT: ${customer.buyerPhone}` : ''}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="text-right">
                  <div className={`text-sm font-black ${sortBy === 'sales' ? 'text-emerald-800' : 'text-slate-800'}`}>
                    {formatVND(customer.sales)}
                  </div>
                  <div className={`text-xs font-bold ${sortBy === 'pv' ? 'text-indigo-700' : 'text-teal-700'}`}>
                    {customer.pv} PV
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onApplyBuyerFilter(customer.memberNumber || customer.buyerName)}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                  >
                    Lọc báo cáo
                  </button>
                  {customer.buyerUserId && (
                    <button
                      type="button"
                      onClick={() => onOpenMemberPurchases(customer.buyerUserId!)}
                      className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                    >
                      Xem đơn
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!sortedCustomers.length && (
          <p className="py-8 text-center text-sm text-slate-500">
            Chưa có giao dịch mua hàng trong giai đoạn này.
          </p>
        )}
      </div>
    </div>
  );
});

TopCustomersSection.displayName = 'TopCustomersSection';
export default TopCustomersSection;
