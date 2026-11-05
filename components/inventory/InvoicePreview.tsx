import React, { memo, useCallback } from 'react';
import { formatVND } from '../../utils/formatters.ts';

interface InvoicePreviewProps { sale: any; seller: any; defaultFormat: 'pdf' | 'image'; onClose: () => void; }
const money = formatVND;
const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

const InvoicePreview: React.FC<InvoicePreviewProps> = memo(({ sale, seller, defaultFormat, onClose }) => {
  const printPdf = useCallback(() => {
    const win = window.open('', '_blank', 'width=700,height=800');
    if (!win) return alert('Trình duyệt đã chặn cửa sổ in. Cho phép popup để xuất PDF.');
    const rows = (sale.lines || []).map((line: any) => `<tr><td>${escapeHtml(line.name)}<br><small>${escapeHtml(line.sku)} · ${escapeHtml(line.priceLevel)}</small></td><td>${line.quantity}</td><td>${money(line.unitPrice)}</td><td>${money(line.quantity * line.unitPrice)}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sale.invoiceNumber)}</title><style>body{font:14px Arial,sans-serif;color:#18221f;max-width:760px;margin:32px auto;padding:20px}h1{font-size:24px}header{border-bottom:2px solid #10a874;padding-bottom:14px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}table{width:100%;border-collapse:collapse}th,td{padding:10px 6px;border-bottom:1px solid #ddd;text-align:left}th{background:#f2f7f5}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}.note{padding:12px;background:#f6f8f7;margin-top:18px}@media print{body{margin:0 auto}}</style></head><body><header><h1>${escapeHtml(seller?.shopName || 'HOÁ ĐƠN BÁN HÀNG')}</h1><div>${escapeHtml(seller?.address || '')} ${escapeHtml(seller?.phone || '')}</div></header><div class="meta"><div><b>Mã hoá đơn:</b> ${escapeHtml(sale.invoiceNumber)}</div><div><b>Ngày bán:</b> ${new Date(sale.soldAt).toLocaleString('vi-VN')}</div><div><b>Người mua:</b> ${escapeHtml(sale.buyerName)}</div><div><b>Trạng thái:</b> ${escapeHtml(sale.status)}</div></div><table><thead><tr><th>Mặt hàng</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Tổng: ${money(sale.total)}<br>PV: ${sale.totalPv}</div>${sale.note ? `<div class="note"><b>Ghi chú:</b> ${escapeHtml(sale.note)}</div>` : ''}<script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  }, [sale, seller]);

  const downloadImage = useCallback(() => {
    const canvas = document.createElement('canvas'); const width = 900; const lineHeight = 38; const rows = sale.lines || [];
    canvas.width = width; canvas.height = 300 + rows.length * lineHeight + (sale.note ? 70 : 0);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#132a22';
    ctx.font = 'bold 32px Arial'; ctx.fillText(seller?.shopName || 'HOÁ ĐƠN BÁN HÀNG', 42, 56);
    ctx.font = '20px Arial'; ctx.fillText(`Mã: ${sale.invoiceNumber}`, 42, 100); ctx.fillText(`Ngày: ${new Date(sale.soldAt).toLocaleString('vi-VN')}`, 42, 132); ctx.fillText(`Người mua: ${sale.buyerName}`, 42, 164);
    ctx.strokeStyle = '#cbd5d1'; ctx.beginPath(); ctx.moveTo(40, 188); ctx.lineTo(860, 188); ctx.stroke();
    rows.forEach((line: any, index: number) => { const y = 226 + index * lineHeight; ctx.font = '18px Arial'; ctx.fillText(`${line.name} (${line.quantity} x ${money(line.unitPrice)})`, 42, y); ctx.textAlign = 'right'; ctx.fillText(money(line.quantity * line.unitPrice), 850, y); ctx.textAlign = 'left'; });
    const y = 245 + rows.length * lineHeight; ctx.font = 'bold 22px Arial'; ctx.fillText(`Tổng: ${money(sale.total)}  ·  PV: ${sale.totalPv}`, 42, y);
    if (sale.note) { ctx.font = '17px Arial'; ctx.fillText(`Ghi chú: ${String(sale.note).slice(0, 120)}`, 42, y + 44); }
    const link = document.createElement('a'); link.download = `${sale.invoiceNumber}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  }, [sale, seller]);

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Xem trước hoá đơn">
    <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black text-slate-900">Xem trước hoá đơn</h2><button onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 font-bold">Đóng</button></div>
      <article className="mx-auto max-w-xl border border-slate-200 p-6 sm:p-9">
        <h1 className="text-2xl font-black text-emerald-700">{seller?.shopName || 'Hoá đơn bán hàng'}</h1><p className="text-sm text-slate-500">{seller?.address} {seller?.phone}</p>
        <div className="my-5 grid grid-cols-1 gap-1 border-y py-4 text-sm sm:grid-cols-2"><div><b>Mã:</b> {sale.invoiceNumber}</div><div><b>Ngày:</b> {new Date(sale.soldAt).toLocaleString('vi-VN')}</div><div><b>Người mua:</b> {sale.buyerName}</div><div><b>Trạng thái:</b> {sale.status}</div></div>
        <div className="space-y-3">{sale.lines?.map((line: any, index: number) => <div key={`${line.itemId}-${index}`} className="flex justify-between gap-3 border-b pb-2 text-sm"><div>{line.name}<div className="text-xs text-slate-500">{line.sku} · {line.quantity} × {money(line.unitPrice)} · {line.priceLevel}</div></div><b>{money(line.quantity * line.unitPrice)}</b></div>)}</div>
        <div className="mt-5 text-right"><p className="text-lg font-black">Tổng: {money(sale.total)}</p><p className="text-sm text-slate-500">Tổng PV: {sale.totalPv}</p></div>{sale.note && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><b>Ghi chú:</b> {sale.note}</p>}
        {sale.buyerChanges?.length > 0 && <div className="mt-4 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900"><b>Lịch sử cập nhật người mua</b>{sale.buyerChanges.map((change: any, index: number) => <p key={index} className="mt-1">{change.fromName} → {change.toName} · {new Date(change.createdAt).toLocaleString('vi-VN')}</p>)}</div>}
        {sale.returnEvents?.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><b>Lịch sử hoàn hàng</b>{sale.returnEvents.map((event: any, index: number) => <p key={index} className="mt-1">{event.reason} · {money(event.refundAmount)} · {new Date(event.createdAt).toLocaleString('vi-VN')}</p>)}</div>}
      </article>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={defaultFormat === 'image' ? downloadImage : printPdf} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Xuất theo mặc định: {defaultFormat === 'image' ? 'Ảnh PNG' : 'PDF'}</button><button onClick={downloadImage} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Tải ảnh PNG</button><button onClick={printPdf} className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-bold text-white">In / Lưu PDF</button></div>
    </div>
  </div>;
});
InvoicePreview.displayName = 'InvoicePreview';
export default InvoicePreview;
