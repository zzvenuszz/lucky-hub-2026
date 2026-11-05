import React, { memo } from 'react';
import CurrencyInput from './CurrencyInput.tsx';

interface ProductDraft {
  sku: string;
  name: string;
  categoryId: string;
  pv: string;
  lowStockThreshold: string;
  imageUrl: string;
}

interface ProductPrices {
  costReference: string;
  price100: string;
  price25: string;
  price35: string;
  price42: string;
  price50: string;
}

interface PriceTier { field: keyof Omit<ProductPrices, 'costReference'>; label: string; }

interface ProductEditModalProps {
  productName: string;
  draft: ProductDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProductDraft>>;
  prices: ProductPrices;
  setPrices: React.Dispatch<React.SetStateAction<ProductPrices>>;
  categories: any[];
  priceTiers: PriceTier[];
  canPrices: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onCreateCategory: () => void;
  onUploadImage: (file?: File) => void;
}

const ProductEditModal: React.FC<ProductEditModalProps> = memo(({
  productName, draft, setDraft, prices, setPrices, categories, priceTiers,
  canPrices, busy, onClose, onSubmit, onCreateCategory, onUploadImage,
}) => (
  <div
    className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-labelledby="edit-product-title"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
  >
    <form onSubmit={onSubmit} className="max-h-[calc(100dvh-24px)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-48px)] sm:p-6">
      <header className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-4 border-b bg-white p-4 sm:-mx-6 sm:-mt-6 sm:p-6">
        <div>
          <h2 id="edit-product-title" className="text-xl font-black">Sửa sản phẩm</h2>
          <p className="mt-1 text-sm font-normal text-slate-500">{productName} · tồn kho được điều chỉnh riêng để giữ nhật ký.</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng sửa sản phẩm" className="rounded-xl bg-slate-100 px-3 py-2 font-bold disabled:opacity-50">✕</button>
      </header>

      <label className="block text-sm font-bold text-slate-700">SKU<input required value={draft.sku} onChange={event => setDraft(old => ({ ...old, sku: event.target.value }))} placeholder="SKU1, SKU2, SKU3" className="mt-1 w-full rounded-xl bg-slate-100 p-3 text-sm font-normal" /><span className="mt-1 block text-xs font-normal text-slate-500">Phân cách các SKU bằng dấu phẩy. Tất cả dùng chung tồn kho, PV và giá.</span></label>
      <label className="block text-sm font-bold text-slate-700">Tên hàng hoá<input required value={draft.name} onChange={event => setDraft(old => ({ ...old, name: event.target.value }))} className="mt-1 w-full rounded-xl bg-slate-100 p-3 text-sm font-normal" /></label>
      <div>
        <label className="block text-sm font-bold text-slate-700">Danh mục</label>
        <div className="mt-1 flex gap-2">
          <select value={draft.categoryId} onChange={event => setDraft(old => ({ ...old, categoryId: event.target.value }))} className="min-w-0 flex-1 rounded-xl bg-slate-100 p-3 text-sm">
            <option value="">Chưa phân loại</option>
            {categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}
          </select>
          <button type="button" onClick={onCreateCategory} className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">+ Tạo</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-bold text-slate-700">Điểm PV<input required type="number" min="0" step="0.01" value={draft.pv} onChange={event => setDraft(old => ({ ...old, pv: event.target.value }))} className="mt-1 w-full rounded-xl bg-slate-100 p-3 text-sm font-normal" /></label>
        <label className="block text-sm font-bold text-slate-700">Cảnh báo tồn khi còn<input required type="number" min="0" value={draft.lowStockThreshold} onChange={event => setDraft(old => ({ ...old, lowStockThreshold: event.target.value }))} className="mt-1 w-full rounded-xl bg-slate-100 p-3 text-sm font-normal" /></label>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Số lượng tồn hiện tại được giữ nguyên. Dùng “Nhập hàng” hoặc “Điều chỉnh” để thay đổi tồn và lưu nhật ký.</div>

      <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
        <div>
          <h3 className="text-sm font-black text-emerald-950">Giá vốn tham chiếu và mức giá bán</h3>
          <p className="mt-1 text-xs font-normal text-emerald-800">Lưu thay đổi sẽ tạo phiên bản bảng giá chung mới; các lô nhập và hóa đơn cũ giữ nguyên giá lịch sử.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold text-slate-700">Giá nhập tham chiếu<CurrencyInput value={prices.costReference} readOnly={!canPrices} onValueChange={value => setPrices(old => ({ ...old, costReference: value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-sm font-normal read-only:bg-slate-100" /></label>
          {priceTiers.map(tier => <label key={tier.field} className="block text-xs font-bold text-slate-700">{tier.label}<CurrencyInput value={prices[tier.field]} readOnly={!canPrices} onValueChange={value => setPrices(old => ({ ...old, [tier.field]: value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-sm font-normal read-only:bg-slate-100" /></label>)}
        </div>
        {!canPrices && <p className="text-xs text-slate-600">Bạn chỉ có thể xem giá. Cần quyền quản lý bảng giá để thay đổi.</p>}
      </div>

      <label className="block text-sm font-bold text-slate-700">Hình ảnh<input type="file" accept="image/*" onChange={event => onUploadImage(event.target.files?.[0])} className="mt-1 w-full rounded-xl bg-slate-50 p-2 text-xs font-normal" /></label>
      {draft.imageUrl && <img src={draft.imageUrl} alt="Xem trước hình ảnh sản phẩm" className="h-24 w-24 rounded-xl object-cover" />}
      <button disabled={busy} className="w-full rounded-xl bg-emerald-700 py-3 font-black text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
    </form>
  </div>
));

ProductEditModal.displayName = 'ProductEditModal';
export default ProductEditModal;
