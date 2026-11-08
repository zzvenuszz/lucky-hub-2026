import React, { memo } from 'react';

interface ProductDraft {
  sku: string;
  name: string;
  categoryId: string;
  pv: string;
  quantity: string;
  lowStockThreshold: string;
  imageUrl: string;
}

interface ProductCreateModalProps {
  draft: ProductDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProductDraft>>;
  categories: any[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onCreateCategory: () => void;
  onScanBarcode: () => void;
  onUploadImage: (file?: File) => void;
}

const ProductCreateModal: React.FC<ProductCreateModalProps> = memo(({
  draft,
  setDraft,
  categories,
  busy,
  onClose,
  onSubmit,
  onCreateCategory,
  onScanBarcode,
  onUploadImage,
}) => (
  <div
    className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-labelledby="create-product-title"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
  >
    <form onSubmit={onSubmit} className="max-h-[calc(100dvh-24px)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-48px)] sm:p-6">
      <header className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-4 border-b bg-white p-4 sm:-mx-6 sm:-mt-6 sm:p-6">
        <div>
          <h2 id="create-product-title" className="text-xl font-black">Thêm mẫu sản phẩm dùng chung</h2>
          <p className="mt-1 text-sm font-normal text-slate-500">Tạo mẫu sản phẩm chung; mỗi kho cá nhân sẽ tự nhập số lượng tồn kho riêng.</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng thêm sản phẩm" className="rounded-xl bg-slate-100 px-3 py-2 font-bold disabled:opacity-50">✕</button>
      </header>

      <div>
        <label htmlFor="create-item-sku" className="block text-sm font-bold text-slate-700">SKU</label>
        <div className="mt-1 flex gap-2">
          <input id="create-item-sku" data-testid="create-item-sku" required value={draft.sku} onChange={event => setDraft(old => ({ ...old, sku: event.target.value }))} placeholder="SKU1, SKU2, SKU3" className="min-w-0 flex-1 rounded-xl bg-slate-100 p-3 text-sm font-normal" />
          <button type="button" onClick={onScanBarcode} className="shrink-0 rounded-xl bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800" aria-label="Quét mã vạch bằng camera">📷 Quét mã</button>
        </div>
        <p className="mt-1 text-xs font-normal text-slate-500">Có thể nhập nhiều SKU, phân cách bằng dấu phẩy. Tất cả dùng chung PV và giá.</p>
      </div>
      <label className="block text-sm font-bold text-slate-700">Tên hàng hoá<input data-testid="create-item-name" required value={draft.name} onChange={event => setDraft(old => ({ ...old, name: event.target.value }))} className="mt-1 w-full rounded-xl bg-slate-100 p-3 text-sm font-normal" /></label>
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
      <label className="block text-sm font-bold text-slate-700">Điểm PV<input required type="number" inputMode="decimal" min="0" step="0.01" placeholder="Điểm PV" value={draft.pv} onChange={event => setDraft(old => ({ ...old, pv: event.target.value }))} className="mt-1 w-full rounded-xl bg-slate-100 p-3 text-sm font-normal" /></label>
      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Giá bán và giá vốn được quản lý riêng trong tab Bảng giá. Tạo sản phẩm không tự tạo phiên bản bảng giá.</p>
      <label className="block text-sm font-bold text-slate-700">Hình ảnh<input type="file" accept="image/*" onChange={event => onUploadImage(event.target.files?.[0])} className="mt-1 w-full rounded-xl bg-slate-50 p-2 text-xs font-normal" /></label>
      {draft.imageUrl && <img src={draft.imageUrl} alt="Xem trước hình ảnh sản phẩm" className="h-24 w-24 rounded-xl object-cover" />}
      <button disabled={busy} className="w-full rounded-xl bg-emerald-700 py-3 font-black text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Thêm vào kho'}</button>
    </form>
  </div>
));

ProductCreateModal.displayName = 'ProductCreateModal';
export default ProductCreateModal;
