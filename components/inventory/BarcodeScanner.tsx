import React, { memo, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface BarcodeScannerProps {
  onDetected: (value: string) => void;
  onClose: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = memo(({ onDetected, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMessage('Trình duyệt không hỗ trợ mở camera. Hãy nhập SKU thủ công hoặc thử trình duyệt khác.');
        return;
      }
      try {
        const hints = new Map<DecodeHintType, BarcodeFormat[] | boolean>([
          [DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.QR_CODE,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.EAN_8,
            BarcodeFormat.EAN_13,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.UPC_EAN_EXTENSION,
            BarcodeFormat.ITF,
            BarcodeFormat.CODABAR,
            BarcodeFormat.DATA_MATRIX,
            BarcodeFormat.PDF_417,
            BarcodeFormat.AZTEC,
            BarcodeFormat.MAXICODE,
            BarcodeFormat.RSS_14,
            BarcodeFormat.RSS_EXPANDED,
          ]],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
              advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
            },
          },
          videoRef.current || undefined,
          (result) => {
            if (!result || !isMounted) return;
            const value = result.getText().trim();
            if (!value) return;
            isMounted = false;
            controlsRef.current?.stop();
            console.log('[InventoryBarcode] Code detected:', { format: result.getBarcodeFormat(), value });
            onDetectedRef.current(value);
          },
        );
        if (isMounted) {
          controlsRef.current = controls;
          console.log('[InventoryBarcode] Camera started:', videoRef.current?.srcObject instanceof MediaStream
            ? videoRef.current.srcObject.getVideoTracks()[0]?.getSettings()
            : undefined);
        }
        else controls.stop();
      } catch (error: any) {
        console.error('[InventoryBarcode] Camera start failed:', error);
        if (!isMounted) return;
        setErrorMessage(error?.name === 'NotAllowedError'
          ? 'Bạn chưa cấp quyền camera. Hãy cho phép camera trong trình duyệt rồi thử lại.'
          : error?.name === 'NotFoundError'
            ? 'Không tìm thấy camera trên thiết bị.'
            : 'Không thể mở camera. Hãy kiểm tra quyền camera và thử lại.');
      }
    };
    startCamera();
    return () => {
      isMounted = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="barcode-scanner-title">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 id="barcode-scanner-title" className="text-lg font-black">Quét mã vạch sản phẩm</h2>
            <p className="mt-1 text-xs text-slate-500">Đưa mã vạch vào giữa khung hình.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold">Đóng</button>
        </div>
        <div className="relative aspect-[4/3] bg-slate-950">
          <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline aria-label="Hình ảnh từ camera để quét mã vạch" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(72%,280px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-emerald-300 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
          {errorMessage && <div role="alert" className="absolute inset-x-4 bottom-4 rounded-xl bg-white p-3 text-sm font-semibold text-rose-700 shadow">{errorMessage}</div>}
        </div>
        <div className="p-4 text-center text-xs text-slate-500">Camera chỉ hoạt động trên HTTPS hoặc localhost và cần bạn cấp quyền truy cập.</div>
      </div>
    </div>
  );
});

BarcodeScanner.displayName = 'BarcodeScanner';
export default BarcodeScanner;
