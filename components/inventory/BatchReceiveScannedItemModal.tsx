import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

export interface BatchReceiveScannedItemModalProps {
  item: any;
  scannedCode?: string;
  currentAddedQuantity?: number;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}

const BatchReceiveScannedItemModal: React.FC<BatchReceiveScannedItemModalProps> = memo(
  ({ item, scannedCode, currentAddedQuantity = 0, onConfirm, onCancel }) => {
    const [quantity, setQuantity] = useState('1');
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      console.log('[BatchReceiveScannedItemModal] Opened for scanned item:', {
        sku: item?.sku,
        name: item?.name,
        scannedCode,
        currentAddedQuantity,
      });
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 60);
      return () => window.clearTimeout(timer);
    }, [item, scannedCode, currentAddedQuantity]);

    const handleSubmit = useCallback(
      (event: React.FormEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const parsed = Number(quantity);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          setError('Vui lòng nhập số lượng là số nguyên lớn hơn 0.');
          return;
        }
        console.log('[BatchReceiveScannedItemModal] Confirmed quantity:', {
          sku: item?.sku,
          name: item?.name,
          quantity: parsed,
        });
        onConfirm(parsed);
      },
      [item, onConfirm, quantity]
    );

    const skuDisplay = (item?.skus?.length ? item.skus : [item?.sku]).filter(Boolean).join(', ');

    return (
      <div
        className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanned-item-modal-title"
        data-testid="batch-scanned-item-modal"
        onMouseDown={event => {
          if (event.target === event.currentTarget) onCancel();
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="max-h-[calc(100dvh-24px)] w-full max-w-md space-y-4 overflow-y-auto overflow-x-hidden rounded-3xl bg-white p-4 shadow-2xl sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 id="scanned-item-modal-title" className="text-base font-black text-slate-900 sm:text-lg">
              Sản phẩm vừa quét mã
            </h3>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Đóng"
              className="shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            {item?.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                data-testid="scanned-item-image"
                className="h-20 w-20 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover"
              />
            ) : (
              <div
                data-testid="scanned-item-image-placeholder"
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-white text-3xl"
              >
                📦
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div
                data-testid="scanned-item-sku"
                className="inline-block rounded-lg bg-emerald-700 px-2 py-0.5 text-xs font-black text-white"
              >
                Mã SP: {scannedCode || skuDisplay}
              </div>
              <div
                data-testid="scanned-item-name"
                className="break-words text-sm font-black text-slate-900 sm:text-base"
              >
                {item?.name}
              </div>
              <div className="text-xs text-slate-600">
                SKU hệ thống: <b>{skuDisplay}</b> · Tồn kho: <b>{item?.quantity ?? 0}</b>
                {currentAddedQuantity > 0 && (
                  <span className="ml-1 font-bold text-rose-600">
                    (Đã chọn: {currentAddedQuantity})
                  </span>
                )}
              </div>
            </div>
          </div>

          <label className="block text-xs font-bold text-slate-700 sm:text-sm">
            Nhập số lượng muốn thêm vào phiếu nhập
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={quantity}
              onChange={event => {
                setError('');
                setQuantity(event.target.value);
              }}
              data-testid="scanned-item-qty-input"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-base font-black text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-xs font-bold text-rose-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              data-testid="scanned-item-cancel-btn"
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200"
            >
              Huỷ
            </button>
            <button
              type="submit"
              data-testid="scanned-item-confirm-btn"
              className="rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-black text-white shadow-sm hover:bg-emerald-800"
            >
              OK
            </button>
          </div>
        </form>
      </div>
    );
  }
);

BatchReceiveScannedItemModal.displayName = 'BatchReceiveScannedItemModal';
export default BatchReceiveScannedItemModal;
