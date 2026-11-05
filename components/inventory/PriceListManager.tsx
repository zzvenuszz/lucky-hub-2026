import React, { memo, useMemo, useState } from 'react';
import { Database } from '../../services/database.ts';
import CurrencyInput from './CurrencyInput.tsx';
import { formatVND } from '../../utils/formatters.ts';

interface Product { sku: string; name: string; pv: number; imageUrl?: string; categoryName?: string; prices?: Record<string, number> | null; }
interface PriceVersion { _id: string; name: string; effectiveFrom: string; effectiveTo?: string | null; entries?: Array<Record<string, any>>; }
interface Props { versions: PriceVersion[]; products: Product[]; canManage: boolean; onSaved: () => Promise<void>; onMessage: (message: string) => void; }
type PriceField = 'price100' | 'price25' | 'price35' | 'price42' | 'price50';
const TIERS: Array<{ field: PriceField; label: string; input: string; text: string; background: string }> = [
  { field: 'price100', label: 'Giá 100%', input: 'bg-red-500/10', text: 'text-red-700', background: 'bg-red-500/50' },
  { field: 'price25', label: 'Giá giảm 25%', input: 'bg-slate-500/10', text: 'text-black', background: 'bg-slate-500/50' },
  { field: 'price35', label: 'Giá giảm 35%', input: 'bg-green-500/10', text: 'text-green-700', background: 'bg-green-500/50' },
  { field: 'price42', label: 'Giá giảm 42%', input: 'bg-purple-500/10', text: 'text-purple-700', background: 'bg-purple-500/50' },
  { field: 'price50', label: 'Giá giảm 50%', input: 'bg-pink-500/10', text: 'text-pink-700', background: 'bg-pink-500/50' },
];
const todayInputValue = () => {
  const today = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
};
const dateOnly = (value?: string | null) => value ? new Date(value).toLocaleDateString('vi-VN') : '';
const inclusiveEndDate = (value?: string | null) => {
  if (!value) return '';
  const end = new Date(value);
  end.setDate(end.getDate() - 1);
  return end.toLocaleDateString('vi-VN');
};
const currentStatus = (version: PriceVersion) => {
  const now = Date.now();
  if (new Date(version.effectiveFrom).getTime() > now) return 'Sắp hiệu lực';
  if (version.effectiveTo && new Date(version.effectiveTo).getTime() <= now) return 'Đã kết thúc';
  return 'Đang hiệu lực';
};

const PriceListManager: React.FC<Props> = memo(({ versions, products, canManage, onSaved, onMessage }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayInputValue);
  const [effectiveTo, setEffectiveTo] = useState('');
  const [entries, setEntries] = useState<Record<string, Record<PriceField, string>>>({});
  const hasHistory = versions.length > 0;
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, Product[]>();
    products.filter(product => product.sku).forEach(product => {
      const category = product.categoryName?.trim() || 'Chưa phân loại';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(product);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'vi')).map(([category, group]) => [category, group.sort((a, b) => a.name.localeCompare(b.name, 'vi'))] as const);
  }, [products]);

  const openCreate = () => {
    const initial: Record<string, Record<PriceField, string>> = {};
    products.filter(product => product.sku).forEach(product => {
      const source = product.prices || {};
      initial[product.sku] = Object.fromEntries(TIERS.map(tier => [tier.field, !hasHistory && source[tier.field] !== undefined ? String(source[tier.field]) : ''])) as Record<PriceField, string>;
    });
    setEntries(initial);
    setName('');
    setEffectiveFrom(todayInputValue());
    setEffectiveTo('');
    setOpen(true);
  };
  const updatePrice = (sku: string, field: PriceField, value: string) => setEntries(old => ({ ...old, [sku]: { ...old[sku], [field]: value } }));
  const save = async () => {
    if (!name.trim()) return onMessage('Nhập tên bảng giá.');
    if (!effectiveFrom) return onMessage('Chọn ngày bắt đầu hiệu lực.');
    if (effectiveTo && effectiveTo < effectiveFrom) return onMessage('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
    if (!products.length) return onMessage('Kho chưa có sản phẩm để tạo bảng giá.');
    const missing = products.find(product => !TIERS.every(tier => entries[product.sku]?.[tier.field] !== undefined && entries[product.sku][tier.field] !== ''));
    if (missing) return onMessage(`Nhập đủ 5 mức giá cho sản phẩm ${missing.name} (${missing.sku}).`);
    setBusy(true);
    try {
      const start = new Date(`${effectiveFrom}T00:00:00`);
      const endExclusive = effectiveTo ? new Date(`${effectiveTo}T00:00:00`) : null;
      if (endExclusive) endExclusive.setDate(endExclusive.getDate() + 1);
      const payloadEntries = products.map(product => ({
        sku: product.sku,
        costReference: Number(product.prices?.costReference || 0),
        ...Object.fromEntries(TIERS.map(tier => [tier.field, Number(entries[product.sku][tier.field])])),
      }));
      console.log('[PriceListUI] Create: submitting price list', { name: name.trim(), effectiveFrom: start.toISOString(), effectiveTo: endExclusive?.toISOString() || null, itemCount: payloadEntries.length });
      await Database.inventory.savePriceList({ name: name.trim(), effectiveFrom: start.toISOString(), effectiveTo: endExclusive?.toISOString() || null, entries: payloadEntries, note: 'Tạo từ danh sách quản lý bảng giá' });
      await onSaved();
      onMessage('Đã tạo và áp dụng bảng giá.');
      setOpen(false);
    } catch (error: any) {
      console.error('[PriceListUI] Create failed:', error);
      onMessage(error.message || 'Không thể tạo bảng giá.');
    } finally { setBusy(false); }
  };

  return <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-black">Danh sách bảng giá</h2><p className="mt-1 text-sm text-slate-500">Giá bán được áp dụng theo ngày hiệu lực của từng bảng.</p></div>
      {canManage && <button onClick={openCreate} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">+ Tạo mới bảng giá</button>}
    </div>
    <div className="space-y-3">
      {versions.map(version => <details key={version._id} className="group rounded-2xl border border-slate-200 p-4">
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3"><span><span className="block font-black">{version.name || 'Bảng giá'}</span><span className="mt-1 block text-sm text-slate-600">Hiệu lực từ {dateOnly(version.effectiveFrom)}{version.effectiveTo ? ` đến ${inclusiveEndDate(version.effectiveTo)}` : ' · chưa đặt ngày kết thúc'}</span></span><span className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${currentStatus(version) === 'Đang hiệu lực' ? 'bg-emerald-100 text-emerald-800' : currentStatus(version) === 'Sắp hiệu lực' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{currentStatus(version)}</span><span className="text-xs text-slate-500">{version.entries?.length || 0} SP · <span className="group-open:hidden">Xem giá</span><span className="hidden group-open:inline">Thu gọn</span></span></span></summary>
        <div className="mt-4 overflow-x-auto border-t pt-3"><table className="w-full min-w-[740px] text-left text-xs"><thead><tr><th className="p-2">SKU</th>{TIERS.map(tier => <th key={tier.field} className={`p-2 text-right ${tier.text}`}>{tier.label}</th>)}</tr></thead><tbody>{version.entries?.map(entry => <tr key={entry.sku} className="border-t border-slate-100"><td className="p-2 font-bold">{entry.sku}</td>{TIERS.map(tier => <td key={tier.field} className="p-2 text-right">{formatVND(entry[tier.field])}</td>)}</tr>)}</tbody></table></div>
      </details>)}
      {!versions.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Chưa có bảng giá nào.</div>}
    </div>
    {open && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="price-list-modal-title">
      <div className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5"><div><h2 id="price-list-modal-title" className="text-lg font-black sm:text-xl">Tạo bảng giá mới</h2><p className="mt-1 text-xs text-slate-500">{hasHistory ? 'Nhập giá mới cho toàn bộ sản phẩm trong kho.' : 'Nhập giá cho toàn bộ sản phẩm trong kho.'}</p></div><button onClick={() => setOpen(false)} aria-label="Đóng" className="rounded-lg bg-slate-100 px-3 py-2 text-lg font-bold">×</button></div>
        <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-3">
          <label className="text-sm font-bold">Tên bảng giá<input value={name} onChange={event => setName(event.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal" placeholder="Ví dụ: Bảng giá tháng 11/2026" /></label>
          <label className="text-sm font-bold">Ngày bắt đầu hiệu lực<input type="date" value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal" /></label>
          <label className="text-sm font-bold">Ngày kết thúc hiệu lực <span className="font-normal text-slate-500">(không bắt buộc)</span><input type="date" min={effectiveFrom} value={effectiveTo} onChange={event => setEffectiveTo(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal" /></label>
        </div>
        <div className="flex-1 overflow-auto">
          {groupedProducts.length ? groupedProducts.map(([category, group]) => <section key={category} className="mb-5">
            <h3 className="sticky left-0 z-10 border-y bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-900">{category}</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-[1050px] table-fixed text-left text-xs sm:text-sm"><thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-bold text-slate-600"><tr><th className="w-16 p-2">Ảnh</th><th className="w-52 p-2">Sản phẩm</th><th className="w-28 p-2">SKU / PV</th>{TIERS.map(tier => <th key={tier.field} className={`w-40 p-2 text-center ${tier.text}`}>{tier.label}</th>)}</tr></thead><tbody>{group.map(product => <tr key={product.sku} className="border-b border-slate-100">
              <td className="p-2">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">Ảnh</div>}</td>
              <td className="p-2 font-semibold">{product.name}</td><td className="p-2"><div className="font-bold">{product.sku}</div><div className="mt-1 text-xs text-slate-500">{Number(product.pv || 0)} PV</div></td>
              {TIERS.map(tier => <td key={tier.field} className={`p-2 ${tier.background}`}><CurrencyInput ariaLabel={`${tier.label} ${product.name}`} value={entries[product.sku]?.[tier.field] ?? ''} onValueChange={value => updatePrice(product.sku, tier.field, value)} placeholder="Nhập giá" className={`w-full rounded-lg border border-white/70 px-2 py-2 text-right font-bold ${tier.input} ${tier.text}`} /></td>)}
            </tr>)}</tbody></table></div>
          </section>) : <p className="p-8 text-center text-sm text-slate-500">Chưa có sản phẩm trong kho.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t bg-white p-4"><button onClick={() => setOpen(false)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">Hủy</button><button onClick={save} disabled={busy || !products.length} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu bảng giá'}</button></div>
      </div>
    </div>}
  </div>;
});

PriceListManager.displayName = 'PriceListManager';
export default PriceListManager;
