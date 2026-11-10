import React, { memo, useCallback, useState } from 'react';
import { User } from '../../types.ts';

interface UserInventoryResetModalProps {
  user: User;
  busy: boolean;
  onClose: () => void;
  onConfirm: (confirmationText: string) => void;
}

const UserInventoryResetModal: React.FC<UserInventoryResetModalProps> = memo(({
  user,
  busy,
  onClose,
  onConfirm,
}) => {
  const [typedText, setTypedText] = useState('');
  const [pasteBlockedNotice, setPasteBlockedNotice] = useState(false);

  const requiredPhraseWithSpace = `XÁC NHẬN XÓA DỮ LIỆU ${user.username}`;
  const normalizeConfirmationText = (value: string) =>
    String(value || '')
      .normalize('NFC')
      .replace(/XOÁ/g, 'XÓA')
      .replace(/xoá/g, 'xóa')
      .replace(/\s+/g, ' ')
      .trim();
  const normalizedInput = normalizeConfirmationText(typedText);
  const normalizedTargetWithSpace = normalizeConfirmationText(`XÁC NHẬN XÓA DỮ LIỆU ${user.username}`);
  const normalizedTargetNoSpace = normalizeConfirmationText(`XÁC NHẬN XÓA DỮ LIỆU${user.username}`);
  const isMatched =
    normalizedInput === normalizedTargetWithSpace ||
    normalizedInput === normalizedTargetNoSpace;

  const handlePreventClipboard = useCallback((event: React.ClipboardEvent | React.DragEvent) => {
    event.preventDefault();
    setPasteBlockedNotice(true);
    console.warn('[UserInventoryResetModal] Copy/paste/drop blocked on confirmation input:', {
      username: user.username,
      eventType: event.type,
    });
  }, [user.username]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nativeInputType = (event.nativeEvent as InputEvent | undefined)?.inputType || '';
    if (nativeInputType === 'insertFromPaste' || nativeInputType === 'insertFromDrop') {
      setPasteBlockedNotice(true);
      console.warn('[UserInventoryResetModal] Native paste/drop input blocked:', {
        username: user.username,
        nativeInputType,
      });
      return;
    }
    setPasteBlockedNotice(false);
    setTypedText(event.target.value);
  }, [user.username]);

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (!isMatched || busy) return;
    console.log('[UserInventoryResetModal] Submitting inventory & invoice reset for user:', {
      username: user.username,
    });
    onConfirm(normalizedInput);
  }, [isMatched, busy, normalizedInput, onConfirm, user.username]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 sm:p-4"
      onClick={e => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-user-inventory-title"
      data-testid="reset-user-inventory-modal"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-lg max-h-[calc(100dvh-24px)] overflow-y-auto overflow-x-hidden rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 space-y-5 animate-in zoom-in-95"
      >
        <div className="text-center space-y-2">
          <div className="text-4xl">🚨</div>
          <h4
            id="reset-user-inventory-title"
            className="font-black text-rose-700 uppercase tracking-widest text-sm"
          >
            Cảnh báo xóa toàn bộ tồn kho &amp; hóa đơn
          </h4>
          <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
            Bạn đang thực hiện xóa sạch dữ liệu kho hàng và hóa đơn của hội viên{' '}
            <strong>{user.fullName}</strong> (<code>@{user.username}</code>).
          </p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-2 text-xs text-rose-900">
          <p className="font-black uppercase tracking-wide text-rose-700">
            ⚠️ Dữ liệu sẽ bị xóa vĩnh viễn và không thể khôi phục:
          </p>
          <ul className="list-disc pl-5 space-y-1 font-semibold">
            <li>Toàn bộ số lượng tồn kho cá nhân của <b>@{user.username}</b> sẽ về <b>0</b>.</li>
            <li>Toàn bộ lô hàng đã nhập và nhật ký xuất/nhập kho của <b>@{user.username}</b>.</li>
            <li>Toàn bộ lịch sử hóa đơn bán hàng của <b>@{user.username}</b>.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-700">
            Để xác minh, vui lòng tự gõ chính xác dòng chữ màu đỏ bên dưới (không cho phép sao chép / dán):
          </p>
          <div
            onCopy={handlePreventClipboard}
            data-testid="reset-user-inventory-phrase"
            className="select-none rounded-xl border-2 border-rose-300 bg-rose-50/80 px-4 py-3 text-center text-sm sm:text-base font-black tracking-wide text-rose-600"
          >
            {requiredPhraseWithSpace}
          </div>
          <input
            type="text"
            value={typedText}
            onChange={handleInputChange}
            onPaste={handlePreventClipboard}
            onDrop={handlePreventClipboard}
            onCopy={handlePreventClipboard}
            onCut={handlePreventClipboard}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Nhập chính xác dòng chữ màu đỏ ở trên..."
            data-testid="reset-user-inventory-input"
            className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
          />
          {pasteBlockedNotice && (
            <p
              role="alert"
              data-testid="reset-user-inventory-paste-warning"
              className="text-xs font-bold text-rose-600"
            >
              Không cho phép sao chép hoặc dán vào ô xác nhận. Vui lòng tự gõ từng ký tự.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-slate-500 font-black uppercase text-[11px] hover:bg-slate-200 transition-all"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={!isMatched || busy}
            data-testid="confirm-reset-user-inventory"
            className="flex-1 py-3.5 rounded-2xl bg-rose-600 text-white font-black uppercase text-[11px] shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Đang xóa dữ liệu...' : 'Xác nhận xóa dữ liệu'}
          </button>
        </div>
      </form>
    </div>
  );
});

UserInventoryResetModal.displayName = 'UserInventoryResetModal';

export default UserInventoryResetModal;
