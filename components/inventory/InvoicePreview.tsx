import React, { memo, useCallback, useEffect, useState } from 'react';
import { formatVND } from '../../utils/formatters.ts';

interface InvoicePreviewProps { sale: any; seller: any; defaultFormat: 'pdf' | 'image'; onClose: () => void; }
const money = formatVND;
const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

const InvoicePreview: React.FC<InvoicePreviewProps> = memo(({ sale, seller, defaultFormat, onClose }) => {
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const printPdf = useCallback(() => {
    console.log('[InvoicePreview] PDF view opened:', { invoiceNumber: sale.invoiceNumber });
    const win = window.open('', '_blank', 'width=700,height=800');
    if (!win) return alert('Trình duyệt đã chặn cửa sổ hoá đơn. Cho phép popup để mở hoá đơn.');
    const rows = (sale.lines || []).map((line: any) => `<tr><td>${escapeHtml(line.name)}<br><small>${escapeHtml(line.sku)} · ${escapeHtml(line.priceLevel)}</small></td><td>${line.quantity}</td><td>${money(line.unitPrice)}</td><td>${money(line.quantity * line.unitPrice)}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HÓA ĐƠN BÁN HÀNG · ${escapeHtml(sale.invoiceNumber)}</title><style>*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#18221f;max-width:760px;margin:0 auto;padding:20px}h1{font-size:24px;margin:0 0 8px}header{border-bottom:2px solid #10a874;padding:18px 0 14px}.actions{position:sticky;top:0;display:flex;gap:10px;padding:12px 0;background:#fff;border-bottom:1px solid #ddd}.actions button{border:0;border-radius:8px;padding:12px 16px;font-weight:bold;background:#087b58;color:#fff}.actions button.secondary{background:#e8efec;color:#18221f}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}table{width:100%;border-collapse:collapse}th,td{padding:10px 6px;border-bottom:1px solid #ddd;text-align:left}th{background:#f2f7f5}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}.note{padding:12px;background:#f6f8f7;margin-top:18px}.contact{line-height:1.6;color:#475569}.buyer{padding:12px;background:#f6f8f7;border-radius:8px;margin:14px 0}@media(max-width:600px){body{padding:12px}.meta{grid-template-columns:1fr}table{font-size:12px}th,td{padding:8px 4px}}@media print{body{padding:0}.actions{display:none!important}}</style></head><body><div class="actions"><button onclick="window.print()">In / Lưu PDF</button><button class="secondary" onclick="window.close();setTimeout(()=>history.back(),100)">Quay lại ứng dụng</button></div><header><h1>HÓA ĐƠN BÁN HÀNG</h1><div class="contact"><div><b>Người bán:</b> ${escapeHtml(seller?.name || '')}</div><div><b>Địa chỉ người bán:</b> ${escapeHtml(seller?.address || '')}</div><div><b>SĐT người bán:</b> ${escapeHtml(seller?.phone || '')}</div></div></header><div class="meta"><div><b>Mã hoá đơn:</b> ${escapeHtml(sale.invoiceNumber)}</div><div><b>Ngày bán:</b> ${new Date(sale.soldAt).toLocaleString('vi-VN')}</div><div><b>Người mua:</b> ${escapeHtml(sale.buyerName)}${sale.buyerMemberNumber ? ` · ${escapeHtml(sale.buyerMemberNumber)}` : ''}</div><div><b>Trạng thái:</b> ${escapeHtml(sale.status)}</div></div><div class="buyer"><b>Thông tin khách hàng</b>${sale.buyerAddress ? `<div>Địa chỉ: ${escapeHtml(sale.buyerAddress)}</div>` : ''}${sale.buyerPhone ? `<div>Số điện thoại: ${escapeHtml(sale.buyerPhone)}</div>` : ''}</div><table><thead><tr><th>Mặt hàng</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Tổng: ${money(sale.total)}<br>PV: ${sale.totalPv}</div>${sale.note ? `<div class="note"><b>Ghi chú:</b> ${escapeHtml(sale.note)}</div>` : ''}</body></html>`);
    win.document.close();
    console.log('[InvoicePreview] Printable invoice ready:', { invoiceNumber: sale.invoiceNumber });
  }, [sale, seller]);

  const downloadImage = useCallback(() => {
    console.log('[InvoicePreview] PNG export started:', { invoiceNumber: sale.invoiceNumber });
    const canvas = document.createElement('canvas'); const width = 900; const rows = sale.lines || [];
    const noteLines = sale.note ? Math.max(1, Math.ceil(String(sale.note).length / 85)) : 0;
    canvas.width = width; canvas.height = 500 + rows.length * 48 + noteLines * 34;
    const ctx = canvas.getContext('2d');
    if (!ctx) { alert('Không thể tạo ảnh hóa đơn trên thiết bị này.'); return; }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#132a22';
    ctx.font = 'bold 32px Arial'; ctx.fillText('HÓA ĐƠN BÁN HÀNG', 42, 56);
    ctx.font = '19px Arial'; let y = 98;
    ctx.fillText(`Người bán: ${String(seller?.name || '').slice(0, 76)}`, 42, y); y += 32;
    ctx.fillText(`Địa chỉ người bán: ${String(seller?.address || '').slice(0, 76)}`, 42, y); y += 32;
    ctx.fillText(`SĐT người bán: ${String(seller?.phone || '').slice(0, 76)}`, 42, y); y += 44;
    ctx.fillText(`Mã hóa đơn: ${sale.invoiceNumber}`, 42, y); y += 32;
    ctx.fillText(`Ngày: ${new Date(sale.soldAt).toLocaleString('vi-VN')}`, 42, y); y += 32;
    ctx.fillText(`Người mua: ${String(sale.buyerName || '').slice(0, 64)}${sale.buyerMemberNumber ? ` · ${sale.buyerMemberNumber}` : ''}`, 42, y); y += 32;
    if (sale.buyerAddress) { ctx.fillText(`Địa chỉ khách hàng: ${String(sale.buyerAddress).slice(0, 76)}`, 42, y); y += 32; }
    if (sale.buyerPhone) { ctx.fillText(`SĐT khách hàng: ${String(sale.buyerPhone).slice(0, 85)}`, 42, y); y += 32; }
    ctx.strokeStyle = '#cbd5d1'; ctx.beginPath(); ctx.moveTo(40, y + 8); ctx.lineTo(860, y + 8); ctx.stroke(); y += 48;
    rows.forEach((line: any) => { ctx.font = '18px Arial'; ctx.fillText(`${String(line.name).slice(0, 54)} (${line.quantity} x ${money(line.unitPrice)})`, 42, y); ctx.textAlign = 'right'; ctx.fillText(money(line.quantity * line.unitPrice), 850, y); ctx.textAlign = 'left'; y += 44; });
    y += 8; ctx.font = 'bold 22px Arial'; ctx.fillText(`Tổng: ${money(sale.total)}  ·  PV: ${sale.totalPv}`, 42, y); y += 42;
    if (sale.note) { ctx.font = '17px Arial'; ctx.fillText(`Ghi chú: ${String(sale.note).slice(0, 100)}`, 42, y); }
    canvas.toBlob(blob => {
      if (!blob) { alert('Không thể tạo file ảnh hóa đơn.'); return; }
      const url = URL.createObjectURL(blob); setImageUrl(old => { if (old) URL.revokeObjectURL(old); return url; });
      console.log('[InvoicePreview] PNG generated:', { invoiceNumber: sale.invoiceNumber, bytes: blob.size });
    }, 'image/png');
  }, [sale, seller]);

  const shareImage = useCallback(async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl); const blob = await response.blob();
      const file = new File([blob], `${sale.invoiceNumber}.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ files: [file], title: `Hóa đơn ${sale.invoiceNumber}` });
      else alert('Thiết bị chưa hỗ trợ chia sẻ ảnh. Bạn có thể nhấn giữ ảnh để lưu vào thiết bị.');
    } catch (error) { console.error('[InvoicePreview] Image sharing failed:', error); }
  }, [imageUrl, sale.invoiceNumber]);

  const saveImage = useCallback(async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl); const blob = await response.blob();
      const file = new File([blob], `${sale.invoiceNumber}.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        try { await navigator.share({ files: [file], title: `Hóa đơn ${sale.invoiceNumber}` }); }
        catch (error: any) { if (error?.name !== 'AbortError') console.error('[InvoicePreview] Save image sharing failed:', error); }
        return;
      }
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) { alert('Ảnh đang hiển thị trong ứng dụng. Nhấn giữ ảnh để lưu vào thiết bị.'); return; }
      const link = document.createElement('a'); link.download = `${sale.invoiceNumber}.png`; link.href = imageUrl; link.click();
    } catch (error) { console.error('[InvoicePreview] Save image failed:', error); alert('Không thể lưu ảnh hóa đơn. Bạn có thể nhấn giữ ảnh để lưu.'); }
  }, [imageUrl, sale.invoiceNumber]);

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Xem trước hoá đơn">
    <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black text-slate-900">Xem trước hoá đơn</h2><button onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 font-bold">Đóng</button></div>
      <article className="mx-auto max-w-xl border border-slate-200 p-6 sm:p-9">
        <h1 className="text-2xl font-black text-emerald-700">HÓA ĐƠN BÁN HÀNG</h1>
        <div className="mt-1 text-sm text-slate-500"><p><b>Người bán:</b> {seller?.name}</p><p><b>Địa chỉ người bán:</b> {seller?.address}</p><p><b>SĐT người bán:</b> {seller?.phone}</p></div>
        <div className="my-5 grid grid-cols-1 gap-1 border-y py-4 text-sm sm:grid-cols-2"><div><b>Mã:</b> {sale.invoiceNumber}</div><div><b>Ngày:</b> {new Date(sale.soldAt).toLocaleString('vi-VN')}</div><div><b>Người mua:</b> {sale.buyerName}{sale.buyerMemberNumber ? ` · ${sale.buyerMemberNumber}` : ''}</div><div><b>Trạng thái:</b> {sale.status}</div><div><b>Địa chỉ khách hàng:</b> {sale.buyerAddress || '—'}</div><div><b>SĐT khách hàng:</b> {sale.buyerPhone || '—'}</div></div>
        <div className="space-y-3">{sale.lines?.map((line: any, index: number) => <div key={`${line.itemId}-${index}`} className="flex justify-between gap-3 border-b pb-2 text-sm"><div>{line.name}<div className="text-xs text-slate-500">{line.sku} · {line.quantity} × {money(line.unitPrice)} · {line.priceLevel}</div></div><b>{money(line.quantity * line.unitPrice)}</b></div>)}</div>
        <div className="mt-5 text-right"><p className="text-lg font-black">Tổng: {money(sale.total)}</p><p className="text-sm text-slate-500">Tổng PV: {sale.totalPv}</p></div>{sale.note && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><b>Ghi chú:</b> {sale.note}</p>}
        {sale.buyerChanges?.length > 0 && <div className="mt-4 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900"><b>Lịch sử cập nhật người mua</b>{sale.buyerChanges.map((change: any, index: number) => <p key={index} className="mt-1">{change.fromName} → {change.toName} · {new Date(change.createdAt).toLocaleString('vi-VN')}</p>)}</div>}
        {sale.returnEvents?.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><b>Lịch sử hoàn hàng</b>{sale.returnEvents.map((event: any, index: number) => <p key={index} className="mt-1">{event.reason} · {money(event.refundAmount)} · {new Date(event.createdAt).toLocaleString('vi-VN')}</p>)}</div>}
      </article>
      {imageUrl && <div className="mx-auto mt-5 max-w-xl rounded-2xl border bg-slate-50 p-3"><div className="mb-2 flex flex-wrap justify-between gap-2"><b className="text-sm">Ảnh hóa đơn đã tạo</b><div className="flex gap-2"><button onClick={saveImage} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Lưu ảnh</button><button onClick={shareImage} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">Chia sẻ</button><button onClick={() => setImageUrl('')} className="rounded-lg bg-white px-3 py-2 text-xs font-bold">Quay lại hóa đơn</button></div></div><img src={imageUrl} alt={`Ảnh hóa đơn ${sale.invoiceNumber}`} className="h-auto w-full" /><p className="mt-2 text-xs text-slate-500">Ảnh được xem ngay trong ứng dụng. Trên điện thoại, có thể nhấn giữ ảnh để lưu.</p></div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={defaultFormat === 'image' ? downloadImage : printPdf} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Xuất theo mặc định: {defaultFormat === 'image' ? 'Ảnh PNG' : 'PDF'}</button><button onClick={downloadImage} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Tải ảnh PNG</button><button onClick={printPdf} className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-bold text-white">In / Lưu PDF</button></div>
    </div>
  </div>;
});
InvoicePreview.displayName = 'InvoicePreview';
export default InvoicePreview;
