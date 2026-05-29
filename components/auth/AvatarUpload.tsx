import React, { memo, useState, useCallback, useRef } from 'react';

interface AvatarUploadProps {
  onAvatarChange: (base64: string | null) => void;
  isValid: boolean | null;
  onValidationChange: (valid: boolean | null, reason?: string) => void;
}

const AvatarUpload: React.FC<AvatarUploadProps> = memo(({ onAvatarChange, isValid, onValidationChange }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [errorReason, setErrorReason] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(false);

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file || isProcessingRef.current) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      onValidationChange(false, 'Vui lòng chọn file ảnh');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      onValidationChange(false, 'Ảnh quá lớn (>5MB). Vui lòng chọn ảnh khác.');
      return;
    }

    isProcessingRef.current = true;
    setIsChecking(true);
    onValidationChange(null); // Đang xử lý

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      onAvatarChange(base64);

      console.log('[AvatarUpload] Avatar selected, verifying with AI...');

      try {
        const response = await fetch('/api/ai/verify-avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 })
        });

        if (!response.ok) {
          // Fallback: cho phép ảnh
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
          onValidationChange(false, result.reason || 'Ảnh không hợp lệ. Vui lòng chọn ảnh khác.');
          setErrorReason(result.reason || 'Ảnh không hợp lệ');
        }
      } catch (err: any) {
        console.error('[AvatarUpload] Verification error:', err.message);
        // Fallback: cho phép ảnh nếu lỗi mạng
        onValidationChange(true);
        setErrorReason('');
      } finally {
        setIsChecking(false);
        isProcessingRef.current = false;
      }
    };

    reader.onerror = () => {
      setIsChecking(false);
      isProcessingRef.current = false;
      onValidationChange(false, 'Không thể đọc file ảnh. Vui lòng thử lại.');
    };

    reader.readAsDataURL(file);
  }, [onAvatarChange, onValidationChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleRemove = useCallback(() => {
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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
          className="hidden"
          id="avatar-upload"
        />

        {/* Preview or Upload Area */}
        {preview ? (
          <div className="relative group">
            <div className="w-full aspect-square max-w-[200px] mx-auto rounded-2xl overflow-hidden shadow-inner bg-slate-50">
              <img
                src={preview}
                alt="Avatar preview"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Overlay actions */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleRemove}
                className="p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all"
                title="Xóa ảnh"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
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
            <div className="flex items-center justify-center gap-1 text-rose-500">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
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