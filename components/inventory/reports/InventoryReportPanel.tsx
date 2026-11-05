import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Database } from '../../../services/database.ts';
import { formatVND } from '../../../utils/formatters.ts';
import {
  formatDateInput,
  getDefaultHerbalifeFiscalYear,
  getSelectableYears,
  InventoryAnalyticsReport,
  ReportPeriodType,
  TopCustomerPeriodType,
} from './reportHelpers.ts';
import SalesCategoryPieChart from './SalesCategoryPieChart.tsx';
import SalesTrendBarChart from './SalesTrendBarChart.tsx';
import StockReportSection from './StockReportSection.tsx';
import TopCustomersSection from './TopCustomersSection.tsx';

interface Props {
  onOpenMemberPurchases: (memberId: string) => void;
  onMessage: (text: string) => void;
}

const PERIOD_TABS: Array<{ id: ReportPeriodType; label: string }> = [
  { id: 'week', label: 'Theo tuần' },
  { id: 'month', label: 'Theo tháng' },
  { id: 'quarter', label: 'Theo quý' },
  { id: 'year', label: 'Theo năm' },
  { id: 'herbalife_fy', label: 'Năm TC Herbalife (01/02 - 31/01)' },
  { id: 'custom', label: 'Khoảng thời gian tùy chỉnh' },
];

const InventoryReportPanel: React.FC<Props> = memo(({ onOpenMemberPurchases, onMessage }) => {
  const now = useMemo(() => new Date(), []);
  const years = useMemo(() => getSelectableYears(now.getFullYear()), [now]);

  const [periodType, setPeriodType] = useState<ReportPeriodType>('month');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number>(() => getDefaultHerbalifeFiscalYear(now));
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() => formatDateInput(now));
  const [customFrom, setCustomFrom] = useState<string>(() =>
    formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1))
  );
  const [customTo, setCustomTo] = useState<string>(() => formatDateInput(now));

  const [buyerInput, setBuyerInput] = useState<string>('');
  const [appliedBuyerQuery, setAppliedBuyerQuery] = useState<string>('');
  const [memberSuggestions, setMemberSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  const [topCustomerPeriod, setTopCustomerPeriod] = useState<TopCustomerPeriodType>('year');
  const [report, setReport] = useState<InventoryAnalyticsReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const trimmed = buyerInput.trim();
    if (trimmed.length < 2) {
      setMemberSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      Database.inventory
        .findMembers(trimmed)
        .then(list => setMemberSuggestions(list || []))
        .catch(err => console.error('[InventoryReportPanel] Member lookup failed:', err));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [buyerInput]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('periodType', periodType);
    params.set('year', String(selectedYear));
    params.set('month', String(selectedMonth));
    params.set('quarter', String(selectedQuarter));
    params.set('fiscalYear', String(selectedFiscalYear));
    params.set('weekDate', selectedWeekDate);
    params.set('from', customFrom);
    params.set('to', customTo);
    params.set('topCustomerPeriod', topCustomerPeriod);
    params.set('topCustomerYear', String(selectedYear));
    params.set('topCustomerMonth', String(selectedMonth));
    params.set('topCustomerQuarter', String(selectedQuarter));
    params.set('topCustomerFiscalYear', String(selectedFiscalYear));
    if (appliedBuyerQuery.trim()) {
      params.set('buyerQuery', appliedBuyerQuery.trim());
    }
    return params.toString();
  }, [
    periodType,
    selectedYear,
    selectedMonth,
    selectedQuarter,
    selectedFiscalYear,
    selectedWeekDate,
    customFrom,
    customTo,
    topCustomerPeriod,
    appliedBuyerQuery,
  ]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    console.log('[InventoryReportPanel] Fetching analytics report:', { queryString });
    try {
      const data = await Database.inventory.analyticsReport(queryString);
      if (data) {
        setReport(data);
        console.log('[InventoryReportPanel] Analytics report loaded:', {
          range: data.range?.label,
          orders: data.salesSummary?.orders,
          sales: data.salesSummary?.sales,
        });
      }
    } catch (error: any) {
      console.error('[InventoryReportPanel] Failed to load analytics report:', error);
      onMessage(error.message || 'Không thể tải dữ liệu báo cáo.');
    } finally {
      setLoading(false);
    }
  }, [queryString, onMessage]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const handlePeriodTabClick = useCallback((nextType: ReportPeriodType) => {
    console.log('[InventoryReportPanel] Period tab changed:', { periodType: nextType });
    setPeriodType(nextType);
  }, []);

  const handleApplyBuyerSearch = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const clean = buyerInput.trim();
      console.log('[InventoryReportPanel] Applying buyer filter:', { buyerQuery: clean });
      setAppliedBuyerQuery(clean);
      setShowSuggestions(false);
    },
    [buyerInput]
  );

  const handleClearBuyerFilter = useCallback(() => {
    console.log('[InventoryReportPanel] Cleared buyer filter');
    setBuyerInput('');
    setAppliedBuyerQuery('');
    setMemberSuggestions([]);
    setShowSuggestions(false);
  }, []);

  const handleSelectSuggestedMember = useCallback((member: any) => {
    const queryValue = member.memberNumber || member.fullName || '';
    console.log('[InventoryReportPanel] Selected member suggestion:', { member });
    setBuyerInput(queryValue);
    setAppliedBuyerQuery(queryValue);
    setShowSuggestions(false);
  }, []);

  const handleQuickBuyerFilter = useCallback((buyerSearch: string) => {
    console.log('[InventoryReportPanel] Quick buyer filter from top customers:', { buyerSearch });
    setBuyerInput(buyerSearch);
    setAppliedBuyerQuery(buyerSearch);
    setShowSuggestions(false);
  }, []);

  return (
    <div className="space-y-6" data-testid="inventory-report-panel">
      {/* Bộ lọc thời gian và người mua */}
      <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">📈 Báo cáo Doanh số & Phân tích Kho hàng</h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Số liệu tính trên kho của bạn (đã trừ hoàn trả và loại trừ các hóa đơn đã hủy).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchReport()}
            disabled={loading}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {loading ? 'Đang tải…' : '↻ Làm mới báo cáo'}
          </button>
        </div>

        {/* Các tab chọn chế độ thời gian */}
        <div className="flex flex-wrap gap-2">
          {PERIOD_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handlePeriodTabClick(tab.id)}
              className={`rounded-xl px-3.5 py-2.5 text-xs font-bold transition sm:text-sm ${
                periodType === tab.id
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Điều khiển chi tiết theo từng chế độ kỳ báo cáo */}
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 lg:grid-cols-[1fr_1fr]">
          <div>
            {periodType === 'week' && (
              <label className="block text-xs font-bold text-slate-600">
                Chọn ngày bất kỳ trong tuần cần xem
                <input
                  type="date"
                  value={selectedWeekDate}
                  onChange={e => setSelectedWeekDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                />
              </label>
            )}

            {periodType === 'month' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-600">
                  Tháng
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Năm
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>Năm {y}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {periodType === 'quarter' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-600">
                  Quý
                  <select
                    value={selectedQuarter}
                    onChange={e => setSelectedQuarter(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                  >
                    <option value={1}>Quý 1 (Tháng 1 - 3)</option>
                    <option value={2}>Quý 2 (Tháng 4 - 6)</option>
                    <option value={3}>Quý 3 (Tháng 7 - 9)</option>
                    <option value={4}>Quý 4 (Tháng 10 - 12)</option>
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Năm
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>Năm {y}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {periodType === 'year' && (
              <label className="block text-xs font-bold text-slate-600">
                Chọn năm dương lịch
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                >
                  {years.map(y => (
                    <option key={y} value={y}>Năm {y} (01/01/{y} - 31/12/{y})</option>
                  ))}
                </select>
              </label>
            )}

            {periodType === 'herbalife_fy' && (
              <label className="block text-xs font-bold text-slate-600">
                Chọn năm tài chính Herbalife (Từ 01/02 đến 31/01 năm sau)
                <select
                  value={selectedFiscalYear}
                  onChange={e => setSelectedFiscalYear(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                >
                  {years.map(y => (
                    <option key={y} value={y}>
                      Năm tài chính {y} (01/02/{y} - 31/01/{y + 1})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {periodType === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-600">
                  Từ ngày
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Đến ngày
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Filter theo người mua (tìm theo tên hoặc mã thành viên) */}
          <form onSubmit={handleApplyBuyerSearch} className="relative">
            <label className="block text-xs font-bold text-slate-600">
              Lọc báo cáo theo người mua (Tên hoặc Mã thành viên)
            </label>
            <div className="mt-1.5 flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={buyerInput}
                  onFocus={() => setShowSuggestions(true)}
                  onChange={e => {
                    setBuyerInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  placeholder="Nhập tên khách hàng hoặc mã thành viên..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {showSuggestions && memberSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {memberSuggestions.map(member => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => handleSelectSuggestedMember(member)}
                        className="block w-full px-3 py-2.5 text-left text-xs hover:bg-emerald-50"
                      >
                        <b className="text-slate-900">{member.fullName}</b>
                        {member.memberNumber && (
                          <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">
                            {member.memberNumber}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-800"
              >
                Lọc
              </button>
              {(appliedBuyerQuery || buyerInput) && (
                <button
                  type="button"
                  onClick={handleClearBuyerFilter}
                  className="shrink-0 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  Xóa lọc
                </button>
              )}
            </div>
            {appliedBuyerQuery && (
              <p className="mt-1.5 text-xs font-bold text-emerald-800">
                Đang lọc theo người mua: “{appliedBuyerQuery}”
              </p>
            )}
          </form>
        </div>

        {/* Thẻ tổng hợp doanh số trong kỳ */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl bg-emerald-50/80 p-4">
            <div className="text-xs font-bold uppercase text-emerald-800">Tổng doanh số trong kỳ</div>
            <div className="mt-2 break-words text-xl font-black text-emerald-950 sm:text-2xl">
              {formatVND(report?.salesSummary?.sales ?? 0)}
            </div>
            <div className="mt-1 text-xs text-emerald-700">{report?.range?.label || ''}</div>
          </div>
          <div className="rounded-2xl bg-teal-50/80 p-4">
            <div className="text-xs font-bold uppercase text-teal-800">Tổng điểm PV bán ra</div>
            <div className="mt-2 text-xl font-black text-teal-950 sm:text-2xl">
              {report?.salesSummary?.pv ?? 0} PV
            </div>
            <div className="mt-1 text-xs text-teal-700">Điểm tích lũy thực tế</div>
          </div>
          <div className="rounded-2xl bg-slate-100 p-4">
            <div className="text-xs font-bold uppercase text-slate-600">Đơn hàng & Sản phẩm</div>
            <div className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">
              {report?.salesSummary?.orders ?? 0} đơn
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {report?.salesSummary?.units ?? 0} sản phẩm bán ra
            </div>
          </div>
          <div className="rounded-2xl bg-indigo-50/80 p-4">
            <div className="text-xs font-bold uppercase text-indigo-800">Lợi nhuận gộp ước tính</div>
            <div className="mt-2 break-words text-xl font-black text-indigo-950 sm:text-2xl">
              {formatVND(report?.salesSummary?.profit ?? 0)}
            </div>
            <div className="mt-1 text-xs text-indigo-700">
              Giá vốn: {formatVND(report?.salesSummary?.cost ?? 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Biểu đồ hình trụ & Biểu đồ tròn */}
      <div className="grid gap-6 xl:grid-cols-2">
        <SalesTrendBarChart
          data={report?.trendSeries || []}
          rangeLabel={report?.range?.label || ''}
        />
        <SalesCategoryPieChart
          byProduct={report?.breakdown?.byProduct || []}
          byCategory={report?.breakdown?.byCategory || []}
        />
      </div>

      {/* Top khách hàng mua nhiều nhất */}
      <TopCustomersSection
        customers={report?.topCustomers?.customers || []}
        rangeLabel={report?.topCustomers?.rangeLabel || report?.range?.label || ''}
        topPeriod={topCustomerPeriod}
        onTopPeriodChange={setTopCustomerPeriod}
        onOpenMemberPurchases={onOpenMemberPurchases}
        onApplyBuyerFilter={handleQuickBuyerFilter}
      />

      {/* Báo cáo tồn kho */}
      <StockReportSection
        summary={report?.stockSummary || null}
        items={report?.stockItems || []}
      />
    </div>
  );
});

InventoryReportPanel.displayName = 'InventoryReportPanel';
export default InventoryReportPanel;
