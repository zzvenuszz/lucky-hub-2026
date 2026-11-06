import React, { memo, useCallback, useMemo, useState } from 'react';
import CurrencyInput from './CurrencyInput.tsx';
import { formatVND } from '../../utils/formatters.ts';

export interface BatchReceiveLine {
  itemId: string;
  sku: string;
  skus: string[];
  name: string;
  pv: number;
  currentStock: number;
  quantity: string;
  unitCost: string;
}

interface BatchReceiveModalProps {
  items: any[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    receivedAt: string;
    reason: string;
    lines: Array<{ itemId: string; sku: string; quantity: number; unitCost: number }>;
  }) => void;
}

const toLocalDateTimeValue = (date: Date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const BatchReceiveModal: React.FC<BatchReceiveModalProps> = memo(({ items, busy, onClose, onSubmit }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [receivedAt, setReceivedAt] = useState(toLocalDateTimeValue());
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<BatchReceiveLine[]>([]);
  const [error, setError] = useState('');

  // Chỉ cho phép nhập các mẫu sản phẩm chưa ngừng bán và có trong bảng giá đang có hiệu lực
  const receivableItems = useMemo(
    () => (items || []).filter(item => !item.archived && (item.hasActivePrice || Boolean(item.prices))),
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return receivableItems;
    return receivableItems.filter(item => {
      const skusText = (item.skus?.length ? item.skus : [item.sku]).join(' ');
      return `${item.name} ${item.sku} ${skusText}`.toLowerCase().includes(q);
    });
  }, [receivableItems, searchQuery]);

  const addItemToList = useCallback((item: any) => {
    setError('');
    const itemId = String(item.id || item._id);
    setLines(prev => {
      const existing = prev.find(line => line.itemId === itemId);
      if (existing) {
        return prev.map(line =>
          line.itemId === itemId
            ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) }
            : line
        );
      }
      const refCost = Number(item.prices?.costReference || item.prices?.price50 || 0);
      return [
        ...prev,
        {
          itemId,
          sku: item.sku,
          skus: item.skus?.length ? item.skus : [item.sku],
          name: item.name,
          pv: Number(item.pv || 0),
          currentStock: Number(item.quantity || 0),
          quantity: '1',
          unitCost: String(refCost),
        },
      ];
    });
    console.log('[BatchReceiveModal] Added product to receiving list:', { sku: item.sku, name: item.name });
  }, []);

  const updateLine = useCallback((itemId: string, patch: Partial<BatchReceiveLine>) => {
    setError('');
    setLines(prev => prev.map(line => (line.itemId === itemId ? { ...line, ...patch } : line)));
  }, []);

  const removeLine = useCallback((itemId: string) => {
    setLines(prev => prev.filter(line => line.itemId !== itemId));
  }, []);

  const summary = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const qty = Math.max(0, Number(line.quantity) || 0);
        const cost = Math.max(0, Number(line.unitCost) || 0);
        acc.totalQuantity += qty;
        acc.totalCost += qty * cost;
        acc.totalPv += qty * line.pv;
        return acc;
      },
      { totalQuantity: 0, totalCost: 0, totalPv: 0 }
    );
  }, [lines]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!lines.length) {
        setError('Vui lòng tìm và thêm ít nhất một sản phẩm vào danh sách nhập kho.');
        return;
      }
      const parsedDate = receivedAt ? new Date(receivedAt) : new Date();
      if (Number.isNaN(parsedDate.getTime())) {
        setError('Ngày nhập không hợp lệ.');
        return;
      }
      const normalizedLines: Array<{ itemId: string; sku: string; quantity: number; unitCost: number }> = [];
      for (const line of lines) {
        const qty = Number(line.quantity);
        const cost = Number(line.unitCost || 0);
        if (!Number.isInteger(qty) || qty <= 0) {
          setError(`Số lượng nhập của “${line.name}” phải là số nguyên lớn hơn 0.`);
          return;
        }
        if (!Number.isFinite(cost) || cost < 0) {
          setError(`Giá vốn của “${line.name}” không hợp lệ.`);
          return;
        }
        normalizedLines.push({
          itemId: line.itemId,
          sku: line.sku,
          quantity: qty,
          unitCost: cost,
        });
      }
      console.log('[BatchReceiveModal] Submitting batch receive:', {
        linesCount: normalizedLines.length,
        receivedAt: parsedDate.toISOString(),
      });
      onSubmit({
        receivedAt: parsedDate.toISOString(),
        reason: reason.trim() || 'Nhập kho theo danh sách',
        lines: normalizedLines,
      });
    },
    [lines, onSubmit, reason, receivedAt]
  );

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-receive-title"
      data-testid="batch-receive-modal"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="max-h-[calc(100dvh-24px)] w-full max-w-4xl space-y-4 overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-48px)] sm:p-6"
      >
        <header className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-4 border-b bg-white p-4 sm:-mx-6 sm:-mt-6 sm:p-6">
          <div>
            <h2 id="batch-receive-title" className="text-xl font-black text-slate-900">
              Phiếu nhập hàng vào kho cá nhân
            </h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Tìm theo SKU hoặc tên sản phẩm từ mẫu có sẵn, thêm vào danh sách, chỉnh số lượng và ngày nhập kho.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng phiếu nhập kho"
            className="rounded-xl bg-slate-100 px-3 py-2 font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            ✕
          </button>
        </header>

        <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2 sm:p-4">
          <label className="block text-xs font-bold text-slate-700 sm:text-sm">
            Ngày nhập kho
            <input
              type="datetime-local"
              required
              value={receivedAt}
              onChange={event => setReceivedAt(event.target.value)}
              data-testid="batch-receive-date"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <label className="block text-xs font-bold text-slate-700 sm:text-sm">
            Ghi chú nhập kho (tùy chọn)
            <input
              type="text"
              maxLength={200}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Ví dụ: Nhập hàng từ công ty đợt 1..."
              data-testid="batch-receive-reason"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Cột trái: Tìm kiếm mẫu sản phẩm để thêm vào danh sách */}
          <div className="space-y-3 rounded-2xl border border-slate-200 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-800">1. Tìm & chọn mẫu sản phẩm</h3>
              <span className="text-xs text-slate-500">{filteredItems.length} mẫu khả dụng</span>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
              data-testid="batch-receive-search"
              className="w-full rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredItems.map(item => {
                const itemId = String(item.id || item._id);
                const inList = lines.find(l => l.itemId === itemId);
                const skuDisplay = (item.skus?.length ? item.skus : [item.sku]).join(', ');
                return (
                  <div
                    key={itemId}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm transition ${
                      inList ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-emerald-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        SKU: {skuDisplay} · PV: {item.pv} · Tồn hiện tại: <b className="text-slate-700">{item.quantity}</b>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addItemToList(item)}
                      data-testid={`batch-add-item-${item.sku}`}
                      className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800"
                    >
                      {inList ? `+ Thêm (${inList.quantity})` : '+ Thêm'}
                    </button>
                  </div>
                );
              })}
              {!filteredItems.length && (
                <p className="py-8 text-center text-xs text-slate-500">
                  Không tìm thấy mẫu sản phẩm phù hợp trong bảng giá đang có hiệu lực.
                </p>
              )}
            </div>
          </div>

          {/* Cột phải: Danh sách sản phẩm chờ nhập kho */}
          <div className="space-y-3 rounded-2xl border border-slate-200 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-800">
                2. Danh sách nhập kho ({lines.length})
              </h3>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLines([])}
                  className="text-xs font-bold text-rose-600 hover:underline"
                >
                  Xoá hết
                </button>
              )}
            </div>

            <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1" data-testid="batch-receive-lines">
              {lines.map(line => (
                <div key={line.itemId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{line.name}</div>
                      <div className="text-xs text-slate-500">
                        SKU: {line.skus.join(', ')} · Tồn hiện tại: {line.currentStock}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.itemId)}
                      aria-label={`Xóa ${line.name} khỏi danh sách nhập`}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <label className="block text-xs font-bold text-slate-600">
                      Số lượng nhập
                      <input
                        type="number" inputMode="numeric"
                        min="1"
                        step="1"
                        required
                        value={line.quantity}
                        onChange={event => updateLine(line.itemId, { quantity: event.target.value })}
                        data-testid={`batch-qty-${line.sku}`}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm font-bold text-slate-900"
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-600">
                      Giá vốn / SP
                      <CurrencyInput
                        value={line.unitCost}
                        onValueChange={value => updateLine(line.itemId, { unitCost: value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm font-normal text-slate-900"
                      />
                    </label>
                  </div>
                </div>
              ))}
              {!lines.length && (
                <p className="py-10 text-center text-xs text-slate-500">
                  Chưa có sản phẩm nào trong danh sách nhập. Hãy bấm “+ Thêm” ở cột bên trái.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs sm:text-sm">
          <div className="space-x-4 text-emerald-950">
            <span>
              Số mặt hàng: <b>{lines.length}</b>
            </span>
            <span>
              Tổng số lượng nhập: <b>{summary.totalQuantity}</b>
            </span>
            <span>
              Tổng PV: <b>{summary.totalPv.toFixed(2)}</b>
            </span>
          </div>
          <div className="font-black text-emerald-900">
            Tổng giá vốn: {formatVND(summary.totalCost)}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={busy || !lines.length}
            data-testid="submit-batch-receive"
            className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? 'Đang nhập kho…' : 'Nhập kho'}
          </button>
        </div>
      </form>
    </div>
  );
});

BatchReceiveModal.displayName = 'BatchReceiveModal';
export default BatchReceiveModal;
