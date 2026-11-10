import React, { memo, useState, useCallback, useRef } from 'react';

interface AvatarUploadProps {
  onAvatarChange: (base64: string | null) => void;
  isValid: boolean | null;
  onValidationChange: (valid: boolean | null, reason?: string) => void;
}

const MAX_RAW_FILE_SIZE = 25 * 1024 * 1024; // 25MB raw photo limit before client compression
const MAX_AVATAR_DIMENSION = 1024;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.readAsDataURL(file);
  });

const compressAvatarImage = async (file: File): Promise<string> => {
  const rawDataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_AVATAR_DIMENSION) / width);
            width = MAX_AVATAR_DIMENSION;
          } else {
            width = Math.round((width * MAX_AVATAR_DIMENSION) / height);
            height = MAX_AVATAR_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        console.log('[AvatarUpload] Image normalized for verification:', {
          originalBytes: file.size,
          compressedLength: compressed.length,
          width: canvas.width,
          height: canvas.height,
        });
        resolve(compressed);
      } catch (err) {
        console.warn('[AvatarUpload] Canvas compression fallback to raw data URL:', err);
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
};

const AvatarUpload: React.FC<AvatarUploadProps> = memo(({ onAvatarChange, isValid, onValidationChange }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [errorReason, setErrorReason] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(false);

  const reportInvalid = useCallback((reason: string) => {
    setErrorReason(reason);
    onValidationChange(false, reason);
  }, [onValidationChange]);

  const handleFileSelect = useCallback(async (file: File | null) => {
    if (!file) return;
    if (isProcessingRef.current) {
      console.warn('[AvatarUpload] File selection ignored while verification is in progress');
      return;
    }

    const isImageType = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name);
    if (!isImageType) {
      reportInvalid('Vui lòng chọn định dạng file ảnh hợp lệ.');
      return;
    }

    if (file.size > MAX_RAW_FILE_SIZE) {
      reportInvalid('Ảnh quá lớn (>25MB). Vui lòng chọn ảnh nhẹ hơn.');
      return;
    }

    isProcessingRef.current = true;
    setIsChecking(true);
    setErrorReason('');
    onValidationChange(null);

    try {
      const base64 = await compressAvatarImage(file);
      setPreview(base64);
      onAvatarChange(base64);

      console.log('[AvatarUpload] Avatar selected, verifying with AI...');

      const response = await fetch('/api/ai/verify-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) {
        console.warn('[AvatarUpload] Verification API error, accepting avatar');
        onValidationChange(true);
        setErrorReason('');
        return;
      }

      const result = await response.json();
      console.log('[AvatarUpload] Verification result:', result);

      if (result.isValid) {
        onValidationChange(true);
        setErrorReason('');
      } else {
        const reason = result.reason || 'Ảnh không hợp lệ. Vui lòng chọn ảnh chụp người thật.';
        reportInvalid(reason);
      }
    } catch (err: any) {
      console.error('[AvatarUpload] Verification error:', err?.message || err);
      // Fallback: cho phép ảnh nếu lỗi mạng/timeout từ AI
      onValidationChange(true);
      setErrorReason('');
    } finally {
      setIsChecking(false);
      isProcessingRef.current = false;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onAvatarChange, onValidationChange, reportInvalid]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    e.target.value = '';
    void handleFileSelect(selectedFile);
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0] || null;
    void handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleOpenPicker = useCallback(() => {
    if (isChecking) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, [isChecking]);

  const handleRemove = useCallback(() => {
    isProcessingRef.current = false;
    setIsChecking(false);
    setPreview(null);
    onAvatarChange(null);
    onValidationChange(null);
    setErrorReason('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onAvatarChange, onValidationChange]);

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
        Ảnh đại diện <span className="text-rose-500">*</span>
      </label>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="relative"
      >
        {/* Hidden file input (không ép capture="environment" để chọn được cả từ thư viện & camera) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
          id="avatar-upload"
          data-testid="register-avatar-input"
        />

        {/* Preview or Upload Area */}
        {preview ? (
          <div className="space-y-2">
            <div
              onClick={handleOpenPicker}
              className={`relative w-full aspect-square max-w-[200px] mx-auto rounded-2xl overflow-hidden shadow-inner bg-slate-50 cursor-pointer border-2 transition-all ${
                isValid === false
                  ? 'border-rose-400 ring-2 ring-rose-100'
                  : isValid === true
                  ? 'border-emerald-400'
                  : 'border-slate-200'
              }`}
              title="Nhấn để chọn ảnh khác"
            >
              <img
                src={preview}
                alt="Avatar preview"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={isChecking}
                onClick={handleOpenPicker}
                data-testid="register-avatar-reselect"
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-black text-[10px] uppercase tracking-wider transition-all disabled:opacity-50"
              >
                🔄 Chọn ảnh khác
              </button>
              <button
                type="button"
                disabled={isChecking}
                onClick={handleRemove}
                data-testid="register-avatar-remove"
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-[10px] uppercase tracking-wider transition-all disabled:opacity-50"
              >
                ✕ Xóa ảnh
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor="avatar-upload"
            className="flex flex-col items-center justify-center w-full aspect-square max-w-[200px] mx-auto rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all active:scale-[0.98]"
          >
            <svg className="w-10 h-10 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-bold text-slate-500 text-center px-4">
              Chọn ảnh đại diện
            </span>
            <span className="text-[9px] text-slate-400 mt-1">
              Nhấn để chọn hoặc kéo thả ảnh vào đây
            </span>
          </label>
        )}

        {/* Status indicators */}
        <div className="mt-3 text-center">
          {isChecking && (
            <div className="flex items-center justify-center gap-2 text-amber-600">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs font-bold">Đang xác thực ảnh...</span>
            </div>
          )}

          {!isChecking && isValid === true && preview && (
            <div className="flex items-center justify-center gap-1 text-emerald-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-[10px] font-black uppercase tracking-wider">Ảnh hợp lệ</span>
            </div>
          )}

          {!isChecking && isValid === false && errorReason && (
            <div role="alert" data-testid="register-avatar-error" className="flex items-center justify-center gap-1 text-rose-500 px-2">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-[10px] font-black uppercase tracking-wider">{errorReason}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

AvatarUpload.displayName = 'AvatarUpload';

export default AvatarUpload;
