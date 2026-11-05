import React, { memo, useState } from 'react';
import CurrencyInput from './CurrencyInput.tsx';

type StockAction = 'receive' | 'adjust';

interface StockActionModalProps {
  action: StockAction;
  itemName: string;
  archived: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { quantity?: number; quantityDelta?: number; unitCost: number; reason?: string }) => void;
}

const StockActionModal: React.FC<StockActionModalProps> = memo(({ action, itemName, archived, busy, onClose, onSubmit }) => {
  const [quantity, setQuantity] = useState('1');
  const [quantityDelta, setQuantityDelta] = useState('');
  const [unitCost, setUnitCost] = useState('0');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const isReceive = action === 'receive';
  const delta = Number(quantityDelta);
  const needsUnitCost = isReceive || delta > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isReceive) {
      const count = Number(quantity);
      if (!Number.isInteger(count) || count <= 0) return setError('Số lượng nhập phải là số nguyên lớn hơn 0.');
      onSubmit({ quantity: count, unitCost: Number(unitCost) || 0 });
      return;
    }
    if (!Number.isInteger(delta) || delta === 0) return setError('Nhập số nguyên tăng hoặc giảm, khác 0.');
    if (archived && delta > 0) return setError('Không thể tăng tồn cho sản phẩm đã ngừng bán.');
    if (!reason.trim()) return setError('Vui lòng nhập lý do điều chỉnh.');
    onSubmit({ quantityDelta: delta, unitCost: delta > 0 ? Number(unitCost) || 0 : 0, reason: reason.trim() });
  };

  return <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="stock-action-title" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div><h2 id="stock-action-title" className="text-xl font-black">{isReceive ? 'Nhập hàng' : 'Điều chỉnh tồn kho'}</h2><p className="mt-1 text-sm text-slate-500">{itemName}</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng thao tác kho" className="rounded-xl bg-slate-100 px-3 py-2 font-bold">✕</button>
      </header>
      {isReceive ? <label className="block text-sm font-bold">Số lượng nhập<input required type="number" min="1" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} className="mt-1 w-full rounded-xl bg-slate-100 p-3 font-normal" /></label> : <>
        <label className="block text-sm font-bold">Điều chỉnh số lượng (tăng dương, giảm âm)<input required type="number" step="1" value={quantityDelta} onChange={event => setQuantityDelta(event.target.value)} className="mt-1 w-full rounded-xl bg-slate-100 p-3 font-normal" /></label>
        <label className="block text-sm font-bold">Lý do điều chỉnh<input required maxLength={250} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-xl bg-slate-100 p-3 font-normal" /></label>
      </>}
      {needsUnitCost && <label className="block text-sm font-bold">Giá vốn mỗi sản phẩm<CurrencyInput required value={unitCost} onValueChange={setUnitCost} className="mt-1 w-full rounded-xl bg-slate-100 p-3 font-normal" /></label>}
      {archived && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Sản phẩm đang ngừng bán; chỉ cho phép giảm tồn kho.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex gap-2"><button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl bg-slate-100 py-3 font-bold">Huỷ</button><button disabled={busy} className="flex-1 rounded-xl bg-emerald-700 py-3 font-black text-white disabled:opacity-50">{busy ? 'Đang lưu…' : isReceive ? 'Xác nhận nhập' : 'Lưu điều chỉnh'}</button></div>
    </form>
  </div>;
});

StockActionModal.displayName = 'StockActionModal';
export default StockActionModal;
