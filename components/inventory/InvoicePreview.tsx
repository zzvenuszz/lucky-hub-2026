import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { formatVND } from '../../utils/formatters.ts';
import {
  buildVietQrPayload,
  drawQrMatrixToContext,
  findVietQrProvider,
  formatTransferDescription,
  generateVietQrDataUrl,
} from '../../utils/vietQr.ts';

interface InvoicePreviewProps { sale: any; seller: any; defaultFormat: 'pdf' | 'image'; onClose: () => void; }
const money = formatVND;
const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

const InvoicePreview: React.FC<InvoicePreviewProps> = memo(({ sale, seller, defaultFormat, onClose }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [qrEnabled, setQrEnabled] = useState(false);
  const isProvisional = Boolean(sale.isProvisional);
  const isDemo = Boolean(sale.isDemo);
  const sellerBankCode = String(seller?.bankName || '').trim();
  const sellerBankAccount = String(seller?.bankAccountNumber || '').trim();
  const canEnableQr = Boolean(sellerBankCode && sellerBankAccount);
  const activeQr = qrEnabled && canEnableQr;
  const bankProvider = useMemo(() => findVietQrProvider(sellerBankCode), [sellerBankCode]);
  const bankDisplayName = bankProvider ? bankProvider.shortName : sellerBankCode;

  const transferDescription = useMemo(() => {
    if (!activeQr) return '';
    return formatTransferDescription(sale.buyerName, sale.invoiceNumber);
  }, [activeQr, sale.buyerName, sale.invoiceNumber]);

  const qrPayload = useMemo(() => {
    if (!activeQr) return '';
    return buildVietQrPayload({
      bankKey: sellerBankCode,
      accountNumber: sellerBankAccount,
      accountName: seller?.name || '',
      amount: Number(sale.total) || 0,
      description: transferDescription,
    });
  }, [activeQr, sellerBankCode, sellerBankAccount, seller?.name, sale.total, transferDescription]);

  const qrDataUrl = useMemo(() => {
    if (!activeQr) return '';
    return generateVietQrDataUrl(
      {
        bankKey: sellerBankCode,
        accountNumber: sellerBankAccount,
        accountName: seller?.name || '',
        amount: Number(sale.total) || 0,
        description: transferDescription,
      },
      260
    );
  }, [activeQr, sellerBankCode, sellerBankAccount, seller?.name, sale.total, transferDescription]);

  useEffect(() => {
    if (!canEnableQr && qrEnabled) {
      setQrEnabled(false);
    }
  }, [canEnableQr, qrEnabled]);

  const handleToggleQr = useCallback(() => {
    if (!canEnableQr) return;
    setQrEnabled(prev => {
      const next = !prev;
      console.log('[InvoicePreview] Transfer QR toggled:', { enabled: next, bank: sellerBankCode });
      return next;
    });
    setImageUrl('');
    setPdfUrl('');
  }, [canEnableQr, sellerBankCode]);
  const invoiceHeading = isDemo ? 'HOÁ ĐƠN TẠM TÍNH' : isProvisional ? 'PHIẾU TẠM TÍNH' : 'HÓA ĐƠN BÁN HÀNG';
  const provisionalNotice = isDemo
    ? 'HOÁ ĐƠN TẠM TÍNH'
    : 'HÓA ĐƠN TẠM TÍNH · CHỈ DÙNG XEM TRƯỚC, CHƯA THANH TOÁN';

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const printPdf = useCallback(() => {
    console.log('[InvoicePreview] PDF view opened:', { invoiceNumber: sale.invoiceNumber, isProvisional, isDemo, activeQr });
    const win = window.open('', '_blank', 'width=700,height=800');
    if (!win) return alert('Trình duyệt đã chặn cửa sổ hoá đơn. Cho phép popup để mở hoá đơn.');
    const rows = (sale.lines || []).map((line: any, index: number) => `<tr class="${index % 2 ? 'alternate' : ''}"><td><b>${escapeHtml(line.name)}</b><br><small>${escapeHtml(line.sku)} · ${escapeHtml(line.priceLevel)}</small></td><td>${line.quantity}</td><td>${money(line.unitPrice)}</td><td class="amount">${money(line.quantity * line.unitPrice)}</td></tr>`).join('');
    const banner = isProvisional ? `<div class="provisional">${provisionalNotice}</div>` : '';
    const qrHtml = activeQr && qrDataUrl
      ? `<div class="qr-card"><img src="${qrDataUrl}" alt="Mã QR thanh toán" class="qr-img"/><div class="qr-note">Quét mã để thanh toán nhanh</div><div class="qr-meta"><b>${escapeHtml(bankDisplayName)}</b> · ${escapeHtml(sellerBankAccount)}<br/>Thụ hưởng: <b>${escapeHtml(seller?.name || '')}</b><br/>Số tiền: <b>${escapeHtml(money(sale.total))}</b></div></div>`
      : '';
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(invoiceHeading)} · ${escapeHtml(sale.invoiceNumber)}</title><style>
      *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#17352b;max-width:760px;margin:0 auto;padding:20px;background:#fff}
      h1{font-size:24px;margin:0 0 8px;color:#087b58;letter-spacing:.3px;${isDemo ? 'text-align:center;' : ''}}header{border-bottom:3px solid #13815d;padding:18px 0 14px}
      .actions{position:sticky;top:0;display:flex;gap:10px;padding:12px 0;background:#fff;border-bottom:1px solid #cadbd3;z-index:2}
      .actions button{border:0;border-radius:8px;padding:12px 16px;font-weight:bold;background:#087b58;color:#fff}.actions button.secondary{background:#e8efec;color:#18221f}
      .contact{line-height:1.65;color:#476359}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}
      .meta>div,.buyer{padding:10px 12px;background:#f2f8f5;border:1px solid #d6e7df;border-radius:7px}.buyer{margin:12px 0;line-height:1.7;display:flex;align-items:center;justify-content:space-between;gap:16px}
      .buyer-info{flex:1;min-width:0}
      .qr-card{shrink:0;text-align:center;background:#fff;border:1px solid #b9d4c8;border-radius:10px;padding:8px 10px;min-width:170px}
      .qr-img{width:116px;height:116px;display:block;margin:0 auto}
      .qr-note{margin-top:4px;font-size:11px;font-weight:bold;color:#075d43}
      .qr-meta{margin-top:3px;font-size:11px;line-height:1.35;color:#476359}
      table{width:100%;border-collapse:collapse;border:1px solid #b9d4c8;margin-top:14px}th,td{padding:10px 8px;border:1px solid #c8ddd3;text-align:left}
      th{background:#087b58;color:#fff;border-color:#087b58}tbody tr.alternate{background:#f3f8f5}td small{color:#667d74}.amount{text-align:right;font-weight:700}
      .total{border:2px solid #13815d;border-radius:8px;background:#f0f8f4;text-align:right;font-size:18px;font-weight:bold;margin-top:16px;padding:12px 14px;color:#075d43}
      .note{padding:12px;background:#f2f8f5;border-left:4px solid #13815d;margin-top:14px;line-height:1.6}
      .provisional{margin:14px 0;padding:12px 14px;text-align:center;background:#fff4d6;border:2px solid #e6a821;border-radius:8px;color:#8a4d00;font-weight:800;letter-spacing:.4px}
      @media(max-width:600px){body{padding:12px}.meta{grid-template-columns:1fr}.buyer{flex-direction:column;align-items:stretch}table{font-size:12px}th,td{padding:8px 4px}}
      @media print{body{padding:0}.actions{display:none!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}thead{display:table-header-group}tr{break-inside:avoid}}
    </style></head><body><div class="actions"><button onclick="window.print()">In / Lưu PDF</button><button class="secondary" onclick="window.close();setTimeout(()=>history.back(),100)">Quay lại ứng dụng</button></div><header><h1>${escapeHtml(invoiceHeading)}</h1><div class="contact"><div><b>Người bán:</b> ${escapeHtml(seller?.name || '')}</div><div><b>Địa chỉ người bán:</b> ${escapeHtml(seller?.address || '')}</div><div><b>SĐT người bán:</b> ${escapeHtml(seller?.phone || '')}</div></div></header>${banner}<div class="meta"><div><b>Mã hoá đơn:</b> ${escapeHtml(sale.invoiceNumber)}</div><div><b>Ngày bán:</b> ${new Date(sale.soldAt).toLocaleString('vi-VN')}</div><div><b>Người mua:</b> ${escapeHtml(sale.buyerName)}${sale.buyerMemberNumber ? ` · ${escapeHtml(sale.buyerMemberNumber)}` : ''}</div><div><b>Trạng thái:</b> ${escapeHtml(isProvisional ? 'Tạm tính · chưa thanh toán' : sale.status)}</div></div><div class="buyer"><div class="buyer-info"><b>Thông tin khách hàng</b><div>Người mua: <b>${escapeHtml(sale.buyerName)}${sale.buyerMemberNumber ? ` · ${escapeHtml(sale.buyerMemberNumber)}` : ''}</b></div>${sale.buyerAddress ? `<div>Địa chỉ: ${escapeHtml(sale.buyerAddress)}</div>` : ''}${sale.buyerPhone ? `<div>Số điện thoại: ${escapeHtml(sale.buyerPhone)}</div>` : ''}</div>${qrHtml}</div><table><thead><tr><th>Mặt hàng</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Tổng: ${money(sale.total)}<br>PV: ${sale.totalPv}</div>${sale.note ? `<div class="note"><b>Ghi chú:</b> ${escapeHtml(sale.note)}</div>` : ''}</body></html>`);
    win.document.close();
    console.log('[InvoicePreview] Printable invoice ready:', { invoiceNumber: sale.invoiceNumber, provisional: isProvisional });
  }, [sale, seller, invoiceHeading, isProvisional, isDemo, provisionalNotice, activeQr, qrDataUrl, bankDisplayName, sellerBankAccount]);

  const renderInvoiceCanvas = useCallback(() => {
    const canvas = document.createElement('canvas');
    const width = 1000;
    const rows = sale.lines || [];
    const hasBuyerAddress = Boolean(sale.buyerAddress);
    const hasBuyerPhone = Boolean(sale.buyerPhone);
    const hasNote = Boolean(sale.note);
    const topHeight = 205 + (isProvisional ? 72 : 0);
    const baseMetaHeight = 260 + (hasBuyerAddress ? 30 : 0) + (hasBuyerPhone ? 30 : 0);
    const metaHeight = activeQr ? Math.max(baseMetaHeight, 290) : baseMetaHeight;
    const noteHeight = hasNote ? 100 : 0;
    canvas.width = width;
    canvas.height = topHeight + metaHeight + 90 + rows.length * 66 + noteHeight + 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) { alert('Không thể dựng hóa đơn trên thiết bị này.'); return null; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#087b58'; ctx.fillRect(0, 0, width, 164);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px Arial';
    if (isDemo) { ctx.textAlign = 'center'; ctx.fillText(invoiceHeading, width / 2, 58); ctx.textAlign = 'left'; }
    else { ctx.fillText(invoiceHeading, 42, 58); }
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
    const maxTextLen = activeQr ? 54 : 85;
    const metadata = [
      `Mã hóa đơn: ${sale.invoiceNumber}`,
      `Ngày: ${new Date(sale.soldAt).toLocaleString('vi-VN')}`,
      `Người mua: ${String(sale.buyerName || '').slice(0, maxTextLen)}${sale.buyerMemberNumber ? ` · ${sale.buyerMemberNumber}` : ''}`,
      `Trạng thái: ${isProvisional ? 'Tạm tính · chưa thanh toán' : sale.status}`,
      ...(hasBuyerAddress ? [`Địa chỉ khách hàng: ${String(sale.buyerAddress).slice(0, maxTextLen)}`] : []),
      ...(hasBuyerPhone ? [`SĐT khách hàng: ${String(sale.buyerPhone).slice(0, maxTextLen)}`] : []),
    ];
    metadata.forEach((value, index) => ctx.fillText(value, 52, metaTop + 34 + index * 34));
    if (activeQr && qrPayload) {
      const qrCardX = 700;
      const qrCardY = metaTop + 12;
      const qrCardW = 252;
      const qrCardH = metaHeight - 40;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrCardX, qrCardY, qrCardW, qrCardH);
      ctx.strokeStyle = '#b9d4c8';
      ctx.lineWidth = 1;
      ctx.strokeRect(qrCardX, qrCardY, qrCardW, qrCardH);
      const qrSize = 148;
      const qrX = qrCardX + Math.floor((qrCardW - qrSize) / 2);
      const qrY = qrCardY + 8;
      drawQrMatrixToContext(ctx, qrPayload, qrX, qrY, qrSize, 2);
      ctx.textAlign = 'center';
      const centerX = qrCardX + qrCardW / 2;
      ctx.fillStyle = '#075d43';
      ctx.font = 'bold 13px Arial';
      ctx.fillText('Quét mã để thanh toán nhanh', centerX, qrY + qrSize + 18);
      ctx.fillStyle = '#17352b';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(`${bankDisplayName} · ${sellerBankAccount}`.slice(0, 34), centerX, qrY + qrSize + 36);
      ctx.fillStyle = '#476359';
      ctx.font = '12px Arial';
      ctx.fillText(`Thụ hưởng: ${String(seller?.name || '').slice(0, 24)}`, centerX, qrY + qrSize + 53);
      ctx.fillStyle = '#087b58';
      ctx.font = 'bold 13px Arial';
      ctx.fillText(`Số tiền: ${money(sale.total)}`, centerX, qrY + qrSize + 71);
      ctx.textAlign = 'left';
    }
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
  }, [sale, seller, invoiceHeading, isProvisional, isDemo, provisionalNotice, activeQr, qrPayload, bankDisplayName, sellerBankAccount]);

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
      const { jsPDF } = await import('jspdf');
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
    <div className="max-h-[calc(100dvh-24px)] w-full max-w-3xl overflow-y-auto overflow-x-hidden rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-48px)] sm:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-lg font-black text-slate-900 sm:text-xl">
          {imageUrl ? `Ảnh hóa đơn${isDemo ? ' DEMO' : isProvisional ? ' tạm tính' : ''}` : 'Xem trước hoá đơn'}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center gap-2.5 rounded-2xl border px-3 py-1.5 text-xs ${
              canEnableQr ? 'border-emerald-200 bg-emerald-50/70 text-slate-800' : 'border-slate-200 bg-slate-50 text-slate-400'
            }`}
            title={
              canEnableQr
                ? `Tạo mã QR nhận chuyển khoản (${bankDisplayName} · ${sellerBankAccount})`
                : 'Vui lòng cập nhật Ngân hàng/Ví và Số tài khoản trong Hồ sơ cá nhân để bật tạo mã QR'
            }
          >
            <span className="font-bold">Mã QR chuyển khoản</span>
            <button
              type="button"
              role="switch"
              aria-checked={activeQr}
              aria-label="Tạo mã QR chuyển khoản"
              data-testid="invoice-qr-toggle"
              disabled={!canEnableQr}
              onClick={handleToggleQr}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                activeQr ? 'bg-emerald-600' : 'bg-slate-300'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  activeQr ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-xl bg-slate-100 px-4 py-2 font-bold">Đóng</button>
        </div>
      </div>
      {!canEnableQr && (
        <p data-testid="invoice-qr-disabled-hint" className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          💡 Muốn hiển thị mã QR chuyển khoản trên hoá đơn, hãy lưu <b>Ngân hàng / Ví điện tử</b> và <b>Số tài khoản</b> trong mục <b>Hồ sơ cá nhân</b>.
        </p>
      )}
      {pdfUrl ? <div className="mx-auto w-full space-y-3"><div className="flex flex-wrap justify-end gap-2"><a href={pdfUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Mở PDF</a><button onClick={() => setPdfUrl('')} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">Quay lại hóa đơn</button></div><iframe title={`PDF hóa đơn ${sale.invoiceNumber}`} src={pdfUrl} className="h-[70vh] w-full rounded-xl border border-slate-200" /><p className="text-center text-xs text-slate-500">Nếu PDF chưa hiện trong khung, bấm “Mở PDF” để xem và lưu vào Tệp.</p></div> : !imageUrl ? <><article className="mx-auto max-w-xl overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
        <div className="border-b-4 border-emerald-700 px-6 py-5 sm:px-9"><h1 className={`text-2xl font-black text-emerald-800 ${isDemo ? 'text-center' : ''}`}>{invoiceHeading}</h1>
          <div className="mt-2 text-sm leading-6 text-slate-600"><p><b>Người bán:</b> {seller?.name}</p><p><b>Địa chỉ người bán:</b> {seller?.address}</p><p><b>SĐT người bán:</b> {seller?.phone}</p></div>
        </div>
        {isProvisional && <div className="mx-5 mt-5 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-3 text-center text-xs font-black tracking-wide text-amber-900 sm:mx-8">{provisionalNotice}</div>}
        <div className="mx-5 my-5 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4 text-sm sm:mx-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 space-y-1.5" data-testid="invoice-buyer-info">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div><b>Mã:</b> {sale.invoiceNumber}</div>
                <div><b>Ngày:</b> {new Date(sale.soldAt).toLocaleString('vi-VN')}</div>
                <div><b>Người mua:</b> {sale.buyerName}{sale.buyerMemberNumber ? ` · ${sale.buyerMemberNumber}` : ''}</div>
                <div><b>Trạng thái:</b> {isProvisional ? 'Tạm tính · chưa thanh toán' : sale.status}</div>
                <div><b>Địa chỉ khách hàng:</b> {sale.buyerAddress || '—'}</div>
                <div><b>SĐT khách hàng:</b> {sale.buyerPhone || '—'}</div>
              </div>
            </div>
            {activeQr && qrDataUrl && (
              <div
                data-testid="invoice-qr-box"
                className="flex shrink-0 flex-col items-center rounded-xl border border-emerald-200 bg-white p-2.5 text-center shadow-sm sm:w-44"
              >
                <img
                  src={qrDataUrl}
                  alt="Mã QR chuyển khoản"
                  data-testid="invoice-qr-image"
                  className="h-28 w-28 rounded-lg border border-slate-100 object-contain"
                />
                <p
                  data-testid="invoice-qr-caption"
                  className="mt-1.5 text-[11px] font-black text-emerald-800"
                >
                  Quét mã để thanh toán nhanh
                </p>
                <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-slate-600">
                  <div className="font-bold text-slate-800">
                    {bankDisplayName} · {sellerBankAccount}
                  </div>
                  <div className="truncate max-w-[160px]">
                    Thụ hưởng: <b>{seller?.name}</b>
                  </div>
                  <div className="font-bold text-emerald-700">
                    Số tiền: {money(sale.total)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
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
