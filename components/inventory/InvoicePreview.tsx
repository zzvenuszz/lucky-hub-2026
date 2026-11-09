import React, { memo, useCallback, useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { formatVND } from '../../utils/formatters.ts';

interface InvoicePreviewProps { sale: any; seller: any; defaultFormat: 'pdf' | 'image'; onClose: () => void; }
const money = formatVND;
const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

const InvoicePreview: React.FC<InvoicePreviewProps> = memo(({ sale, seller, defaultFormat, onClose }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const isProvisional = Boolean(sale.isProvisional);
  const isDemo = Boolean(sale.isDemo);
  const invoiceHeading = isDemo ? 'HÓA ĐƠN BÁN HÀNG · DEMO' : isProvisional ? 'PHIẾU TẠM TÍNH' : 'HÓA ĐƠN BÁN HÀNG';
  const provisionalNotice = isDemo
    ? 'DEMO · HÓA ĐƠN TẠM TÍNH · KHÔNG CÓ GIÁ TRỊ THẬT'
    : 'HÓA ĐƠN TẠM TÍNH · CHỈ DÙNG XEM TRƯỚC, CHƯA THANH TOÁN';

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const printPdf = useCallback(() => {
    console.log('[InvoicePreview] PDF view opened:', { invoiceNumber: sale.invoiceNumber, isProvisional, isDemo });
    const win = window.open('', '_blank', 'width=700,height=800');
    if (!win) return alert('Trình duyệt đã chặn cửa sổ hoá đơn. Cho phép popup để mở hoá đơn.');
    const rows = (sale.lines || []).map((line: any, index: number) => `<tr class="${index % 2 ? 'alternate' : ''}"><td><b>${escapeHtml(line.name)}</b><br><small>${escapeHtml(line.sku)} · ${escapeHtml(line.priceLevel)}</small></td><td>${line.quantity}</td><td>${money(line.unitPrice)}</td><td class="amount">${money(line.quantity * line.unitPrice)}</td></tr>`).join('');
    const banner = isProvisional ? `<div class="provisional">${provisionalNotice}</div>` : '';
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(invoiceHeading)} · ${escapeHtml(sale.invoiceNumber)}</title><style>
      *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#17352b;max-width:760px;margin:0 auto;padding:20px;background:#fff}
      h1{font-size:24px;margin:0 0 8px;color:#087b58;letter-spacing:.3px}header{border-bottom:3px solid #13815d;padding:18px 0 14px}
      .actions{position:sticky;top:0;display:flex;gap:10px;padding:12px 0;background:#fff;border-bottom:1px solid #cadbd3;z-index:2}
      .actions button{border:0;border-radius:8px;padding:12px 16px;font-weight:bold;background:#087b58;color:#fff}.actions button.secondary{background:#e8efec;color:#18221f}
      .contact{line-height:1.65;color:#476359}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}
      .meta>div,.buyer{padding:10px 12px;background:#f2f8f5;border:1px solid #d6e7df;border-radius:7px}.buyer{margin:12px 0;line-height:1.7}
      table{width:100%;border-collapse:collapse;border:1px solid #b9d4c8;margin-top:14px}th,td{padding:10px 8px;border:1px solid #c8ddd3;text-align:left}
      th{background:#087b58;color:#fff;border-color:#087b58}tbody tr.alternate{background:#f3f8f5}td small{color:#667d74}.amount{text-align:right;font-weight:700}
      .total{border:2px solid #13815d;border-radius:8px;background:#f0f8f4;text-align:right;font-size:18px;font-weight:bold;margin-top:16px;padding:12px 14px;color:#075d43}
      .note{padding:12px;background:#f2f8f5;border-left:4px solid #13815d;margin-top:14px;line-height:1.6}
      .provisional{margin:14px 0;padding:12px 14px;text-align:center;background:#fff4d6;border:2px solid #e6a821;border-radius:8px;color:#8a4d00;font-weight:800;letter-spacing:.4px}
      @media(max-width:600px){body{padding:12px}.meta{grid-template-columns:1fr}table{font-size:12px}th,td{padding:8px 4px}}
      @media print{body{padding:0}.actions{display:none!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}thead{display:table-header-group}tr{break-inside:avoid}}
    </style></head><body><div class="actions"><button onclick="window.print()">In / Lưu PDF</button><button class="secondary" onclick="window.close();setTimeout(()=>history.back(),100)">Quay lại ứng dụng</button></div><header><h1>${escapeHtml(invoiceHeading)}</h1><div class="contact"><div><b>Người bán:</b> ${escapeHtml(seller?.name || '')}</div><div><b>Địa chỉ người bán:</b> ${escapeHtml(seller?.address || '')}</div><div><b>SĐT người bán:</b> ${escapeHtml(seller?.phone || '')}</div></div></header>${banner}<div class="meta"><div><b>Mã hoá đơn:</b> ${escapeHtml(sale.invoiceNumber)}</div><div><b>Ngày bán:</b> ${new Date(sale.soldAt).toLocaleString('vi-VN')}</div><div><b>Người mua:</b> ${escapeHtml(sale.buyerName)}${sale.buyerMemberNumber ? ` · ${escapeHtml(sale.buyerMemberNumber)}` : ''}</div><div><b>Trạng thái:</b> ${escapeHtml(isProvisional ? 'Tạm tính · chưa thanh toán' : sale.status)}</div></div><div class="buyer"><b>Thông tin khách hàng</b>${sale.buyerAddress ? `<div>Địa chỉ: ${escapeHtml(sale.buyerAddress)}</div>` : ''}${sale.buyerPhone ? `<div>Số điện thoại: ${escapeHtml(sale.buyerPhone)}</div>` : ''}</div><table><thead><tr><th>Mặt hàng</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Tổng: ${money(sale.total)}<br>PV: ${sale.totalPv}</div>${sale.note ? `<div class="note"><b>Ghi chú:</b> ${escapeHtml(sale.note)}</div>` : ''}</body></html>`);
    win.document.close();
    console.log('[InvoicePreview] Printable invoice ready:', { invoiceNumber: sale.invoiceNumber, provisional: isProvisional });
  }, [sale, seller, invoiceHeading, isProvisional, isDemo, provisionalNotice]);

  const renderInvoiceCanvas = useCallback(() => {
    const canvas = document.createElement('canvas');
    const width = 1000;
    const rows = sale.lines || [];
    const hasBuyerAddress = Boolean(sale.buyerAddress);
    const hasBuyerPhone = Boolean(sale.buyerPhone);
    const hasNote = Boolean(sale.note);
    const topHeight = 205 + (isProvisional ? 72 : 0);
    const metaHeight = 260 + (hasBuyerAddress ? 30 : 0) + (hasBuyerPhone ? 30 : 0);
    const noteHeight = hasNote ? 100 : 0;
    canvas.width = width;
    canvas.height = topHeight + metaHeight + 90 + rows.length * 66 + noteHeight + 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) { alert('Không thể dựng hóa đơn trên thiết bị này.'); return null; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#087b58'; ctx.fillRect(0, 0, width, 164);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px Arial'; ctx.fillText(invoiceHeading, 42, 58);
    ctx.font = '19px Arial'; ctx.fillText(`Người bán: ${String(seller?.name || '').slice(0, 80)}`, 42, 94);
    ctx.font = '16px Arial'; ctx.fillStyle = '#dff3e9';
    ctx.fillText(`Địa chỉ: ${String(seller?.address || '').slice(0, 95)}`, 42, 120);
    ctx.fillText(`Điện thoại: ${String(seller?.phone || '').slice(0, 95)}`, 42, 148);
    let y = 182;
    if (isProvisional) {
      ctx.fillStyle = '#fff4d6'; ctx.fillRect(32, y, 936, 54);
      ctx.strokeStyle = '#e6a821'; ctx.lineWidth = 2; ctx.strokeRect(32, y, 936, 54);
      ctx.fillStyle = '#8a4d00'; ctx.font = 'bold 17px Arial'; ctx.textAlign = 'center'; ctx.fillText(provisionalNotice, width / 2, y + 34); ctx.textAlign = 'left';
      y += 72;
    }
    const metaTop = y;
    const metaBottom = metaTop + metaHeight - 16;
    ctx.fillStyle = '#f2f8f5'; ctx.fillRect(32, metaTop, 936, metaHeight - 16);
    ctx.strokeStyle = '#c8ddd3'; ctx.lineWidth = 1.5; ctx.strokeRect(32, metaTop, 936, metaHeight - 16);
    ctx.fillStyle = '#17352b'; ctx.font = '17px Arial';
    const metadata = [
      `Mã hóa đơn: ${sale.invoiceNumber}`,
      `Ngày: ${new Date(sale.soldAt).toLocaleString('vi-VN')}`,
      `Người mua: ${String(sale.buyerName || '').slice(0, 75)}${sale.buyerMemberNumber ? ` · ${sale.buyerMemberNumber}` : ''}`,
      `Trạng thái: ${isProvisional ? 'Tạm tính · chưa thanh toán' : sale.status}`,
      ...(hasBuyerAddress ? [`Địa chỉ khách hàng: ${String(sale.buyerAddress).slice(0, 90)}`] : []),
      ...(hasBuyerPhone ? [`SĐT khách hàng: ${String(sale.buyerPhone).slice(0, 90)}`] : []),
    ];
    metadata.forEach((value, index) => ctx.fillText(value, 52, metaTop + 34 + index * 34));
    y = metaBottom + 28;
    ctx.fillStyle = '#087b58'; ctx.fillRect(32, y, 936, 42);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px Arial';
    ctx.fillText('MẶT HÀNG', 48, y + 27); ctx.fillText('SL', 630, y + 27); ctx.fillText('ĐƠN GIÁ', 704, y + 27); ctx.textAlign = 'right'; ctx.fillText('THÀNH TIỀN', 952, y + 27); ctx.textAlign = 'left';
    y += 42;
    rows.forEach((line: any, index: number) => {
      const rowTop = y;
      ctx.fillStyle = index % 2 ? '#f3f8f5' : '#ffffff'; ctx.fillRect(32, rowTop, 936, 62);
      ctx.strokeStyle = '#c8ddd3'; ctx.lineWidth = 1; ctx.strokeRect(32, rowTop, 936, 62);
      ctx.fillStyle = '#17352b'; ctx.font = 'bold 15px Arial'; ctx.fillText(String(line.name).slice(0, 52), 48, rowTop + 24);
      ctx.fillStyle = '#667d74'; ctx.font = '12px Arial'; ctx.fillText(`${String(line.sku || '').slice(0, 28)} · ${String(line.priceLevel || '')}`, 48, rowTop + 45);
      ctx.fillStyle = '#17352b'; ctx.font = '15px Arial'; ctx.fillText(String(line.quantity), 630, rowTop + 36); ctx.fillText(money(line.unitPrice), 704, rowTop + 36);
      ctx.textAlign = 'right'; ctx.font = 'bold 15px Arial'; ctx.fillText(money(line.quantity * line.unitPrice), 952, rowTop + 36); ctx.textAlign = 'left';
      y += 62;
    });
    y += 18;
    ctx.fillStyle = '#f0f8f4'; ctx.fillRect(600, y, 368, 74); ctx.strokeStyle = '#13815d'; ctx.lineWidth = 2; ctx.strokeRect(600, y, 368, 74);
    ctx.fillStyle = '#075d43'; ctx.textAlign = 'right'; ctx.font = 'bold 21px Arial'; ctx.fillText(`Tổng: ${money(sale.total)}`, 948, y + 31); ctx.font = '16px Arial'; ctx.fillText(`Tổng PV: ${sale.totalPv}`, 948, y + 58); ctx.textAlign = 'left';
    y += 94;
    if (hasNote) {
      ctx.fillStyle = '#f2f8f5'; ctx.fillRect(32, y, 936, 72); ctx.fillStyle = '#17352b'; ctx.font = '15px Arial';
      ctx.fillText('Ghi chú:', 48, y + 26);
      const note = String(sale.note);
      ctx.fillText(note.slice(0, 110), 48, y + 51);
    }
    return canvas;
  }, [sale, seller, invoiceHeading, isProvisional, isDemo, provisionalNotice]);

  const downloadImage = useCallback(() => {
    console.log('[InvoicePreview] PNG export started:', { invoiceNumber: sale.invoiceNumber, isProvisional, isDemo });
    const canvas = renderInvoiceCanvas();
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) { alert('Không thể tạo file ảnh hóa đơn.'); return; }
      const url = URL.createObjectURL(blob); setImageUrl(old => { if (old) URL.revokeObjectURL(old); return url; });
      console.log('[InvoicePreview] PNG generated:', { invoiceNumber: sale.invoiceNumber, bytes: blob.size, provisional: isProvisional });
    }, 'image/png');
  }, [sale.invoiceNumber, isProvisional, isDemo, renderInvoiceCanvas]);

  const exportPdf = useCallback(async () => {
    console.log('[InvoicePreview] PDF export started:', { invoiceNumber: sale.invoiceNumber, isProvisional, isDemo });
    try {
      const canvas = renderInvoiceCanvas();
      if (!canvas) return;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = 210;
      const pageHeight = 297;
      const sourcePageHeight = Math.floor(canvas.width * pageHeight / pageWidth);
      let sourceY = 0;
      let pageIndex = 0;
      while (sourceY < canvas.height) {
        const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const context = pageCanvas.getContext('2d');
        if (!context) throw new Error('Không thể dựng trang PDF trên thiết bị này.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (pageIndex > 0) pdf.addPage('a4', 'portrait');
        const renderedHeight = sliceHeight * pageWidth / canvas.width;
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidth, renderedHeight, undefined, 'FAST');
        sourceY += sliceHeight;
        pageIndex += 1;
      }
      const blob = pdf.output('blob');
      const file = new File([blob], `${sale.invoiceNumber}.pdf`, { type: 'application/pdf' });
      console.log('[InvoicePreview] PDF generated:', { invoiceNumber: sale.invoiceNumber, bytes: blob.size, pages: pageIndex });
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isIOSWebClip = isIOS && (Boolean((navigator as any).standalone) || window.matchMedia('(display-mode: standalone)').matches);
      if (isIOS && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: `${invoiceHeading} ${sale.invoiceNumber}` });
        console.log('[InvoicePreview] PDF shared to iOS share sheet:', { invoiceNumber: sale.invoiceNumber });
        return;
      }
      const url = URL.createObjectURL(blob);
      if (isIOSWebClip) {
        setPdfUrl(old => { if (old) URL.revokeObjectURL(old); return url; });
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error: any) {
      console.error('[InvoicePreview] PDF export failed:', error);
      if (error?.name !== 'AbortError') alert(error?.message || 'Không thể xuất file PDF hóa đơn.');
    }
  }, [sale, invoiceHeading, isProvisional, isDemo, renderInvoiceCanvas]);

  const shareImage = useCallback(async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl); const blob = await response.blob();
      const file = new File([blob], `${sale.invoiceNumber}.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ files: [file], title: `${invoiceHeading} ${sale.invoiceNumber}` });
      else alert('Thiết bị chưa hỗ trợ chia sẻ ảnh. Bạn có thể nhấn giữ ảnh để lưu vào thiết bị.');
    } catch (error) { console.error('[InvoicePreview] Image sharing failed:', error); }
  }, [imageUrl, sale.invoiceNumber, invoiceHeading]);

  const saveImage = useCallback(async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl); const blob = await response.blob();
      const file = new File([blob], `${sale.invoiceNumber}.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        try { await navigator.share({ files: [file], title: `${invoiceHeading} ${sale.invoiceNumber}` }); }
        catch (error: any) { if (error?.name !== 'AbortError') console.error('[InvoicePreview] Save image sharing failed:', error); }
        return;
      }
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) { alert('Ảnh đang hiển thị trong ứng dụng. Nhấn giữ ảnh để lưu vào thiết bị.'); return; }
      const link = document.createElement('a'); link.download = `${sale.invoiceNumber}.png`; link.href = imageUrl; link.click();
    } catch (error) { console.error('[InvoicePreview] Save image failed:', error); alert('Không thể lưu ảnh hóa đơn. Bạn có thể nhấn giữ ảnh để lưu.'); }
  }, [imageUrl, sale.invoiceNumber, invoiceHeading]);

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Xem trước hoá đơn">
    <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black text-slate-900">{imageUrl ? `Ảnh hóa đơn${isDemo ? ' DEMO' : isProvisional ? ' tạm tính' : ''}` : 'Xem trước hoá đơn'}</h2><button onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 font-bold">Đóng</button></div>
      {pdfUrl ? <div className="mx-auto w-full space-y-3"><div className="flex flex-wrap justify-end gap-2"><a href={pdfUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Mở PDF</a><button onClick={() => setPdfUrl('')} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">Quay lại hóa đơn</button></div><iframe title={`PDF hóa đơn ${sale.invoiceNumber}`} src={pdfUrl} className="h-[70vh] w-full rounded-xl border border-slate-200" /><p className="text-center text-xs text-slate-500">Nếu PDF chưa hiện trong khung, bấm “Mở PDF” để xem và lưu vào Tệp.</p></div> : !imageUrl ? <><article className="mx-auto max-w-xl overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
        <div className="border-b-4 border-emerald-700 px-6 py-5 sm:px-9"><h1 className="text-2xl font-black text-emerald-800">{invoiceHeading}</h1>
          <div className="mt-2 text-sm leading-6 text-slate-600"><p><b>Người bán:</b> {seller?.name}</p><p><b>Địa chỉ người bán:</b> {seller?.address}</p><p><b>SĐT người bán:</b> {seller?.phone}</p></div>
        </div>
        {isProvisional && <div className="mx-5 mt-5 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-3 text-center text-xs font-black tracking-wide text-amber-900 sm:mx-8">{provisionalNotice}</div>}
        <div className="mx-5 my-5 grid grid-cols-1 gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4 text-sm sm:mx-8 sm:grid-cols-2"><div><b>Mã:</b> {sale.invoiceNumber}</div><div><b>Ngày:</b> {new Date(sale.soldAt).toLocaleString('vi-VN')}</div><div><b>Người mua:</b> {sale.buyerName}{sale.buyerMemberNumber ? ` · ${sale.buyerMemberNumber}` : ''}</div><div><b>Trạng thái:</b> {isProvisional ? 'Tạm tính · chưa thanh toán' : sale.status}</div><div><b>Địa chỉ khách hàng:</b> {sale.buyerAddress || '—'}</div><div><b>SĐT khách hàng:</b> {sale.buyerPhone || '—'}</div></div>
        <div className="mx-5 overflow-hidden rounded-lg border border-emerald-200 sm:mx-8"><div className="grid grid-cols-[1fr_auto] gap-3 bg-emerald-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white"><span>Mặt hàng</span><span>Thành tiền</span></div><div className="divide-y divide-emerald-100">{sale.lines?.map((line: any, index: number) => <div key={`${line.itemId}-${index}`} className={`flex justify-between gap-3 px-3 py-3 text-sm ${index % 2 ? 'bg-emerald-50/50' : 'bg-white'}`}><div>{line.name}<div className="text-xs text-slate-500">{line.sku} · {line.quantity} × {money(line.unitPrice)} · {line.priceLevel}</div></div><b className="whitespace-nowrap">{money(line.quantity * line.unitPrice)}</b></div>)}</div></div>
        <div className="mx-5 my-5 rounded-lg border-2 border-emerald-700 bg-emerald-50 px-4 py-3 text-right sm:mx-8"><p className="text-lg font-black text-emerald-900">Tổng: {money(sale.total)}</p><p className="text-sm text-emerald-800">Tổng PV: {sale.totalPv}</p></div>{sale.note && <p className="mx-5 mb-5 rounded-lg border-l-4 border-emerald-600 bg-slate-50 p-3 text-sm sm:mx-8"><b>Ghi chú:</b> {sale.note}</p>}
        {sale.buyerChanges?.length > 0 && <div className="mx-5 mb-4 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900 sm:mx-8"><b>Lịch sử cập nhật người mua</b>{sale.buyerChanges.map((change: any, index: number) => <p key={index} className="mt-1">{change.fromName} → {change.toName} · {new Date(change.createdAt).toLocaleString('vi-VN')}</p>)}</div>}
        {sale.returnEvents?.length > 0 && <div className="mx-5 mb-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 sm:mx-8"><b>Lịch sử hoàn hàng</b>{sale.returnEvents.map((event: any, index: number) => <p key={index} className="mt-1">{event.reason} · {money(event.refundAmount)} · {new Date(event.createdAt).toLocaleString('vi-VN')}</p>)}</div>}
      </article><div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={defaultFormat === 'image' ? downloadImage : exportPdf} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Xuất theo mặc định: {defaultFormat === 'image' ? 'Ảnh PNG' : 'PDF'}</button><button onClick={downloadImage} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Tải ảnh PNG</button><button onClick={exportPdf} className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-bold text-white">Xuất file PDF</button><button onClick={printPdf} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">In hóa đơn</button></div></> : <div className="mx-auto max-w-xl"><div className="mb-3 flex flex-wrap justify-end gap-2"><button onClick={saveImage} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Lưu ảnh</button><button onClick={shareImage} className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">Chia sẻ</button><button onClick={() => setImageUrl('')} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">Quay lại hóa đơn</button></div><img src={imageUrl} alt={`Ảnh hóa đơn ${sale.invoiceNumber}`} className="h-auto w-full rounded-xl border border-slate-200" /><p className="mt-2 text-center text-xs text-slate-500">Ảnh hóa đơn {sale.invoiceNumber}. Trên điện thoại, có thể nhấn giữ ảnh để lưu.</p></div>}
    </div>
  </div>;
});
InvoicePreview.displayName = 'InvoicePreview';
export default InvoicePreview;
