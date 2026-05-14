import React, { useState, useEffect, memo } from 'react';

interface ResetPasswordFormProps {
  token: string;
  onSuccess: () => void;
  onBackToLogin: () => void;
}

const ResetPasswordForm: React.FC<ResetPasswordFormProps> = memo(({ token, onSuccess, onBackToLogin }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isValidToken, setIsValidToken] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const response = await fetch(`/api/verify-reset-token/${token}`);
        const data = await response.json();

        if (response.ok && data.valid) {
          setIsValidToken(true);
          setEmail(data.email);
        } else {
          setMessage({ text: data.message || 'Token không hợp lệ hoặc đã hết hạn', type: 'error' });
        }
      } catch (error) {
        setMessage({ text: 'Không thể xác minh token. Vui lòng thử lại.', type: 'error' });
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      setMessage({ text: 'Vui lòng nhập đầy đủ thông tin', type: 'error' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ text: 'Mật khẩu phải có ít nhất 6 ký tự', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Mật khẩu xác nhận không khớp', type: 'error' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({
          text: 'Mật khẩu đã được đặt lại thành công! Bạn sẽ được chuyển hướng đến trang đăng nhập.',
          type: 'success'
        });
        setTimeout(() => {
          // Xóa token khỏi URL trước khi chuyển về login
          window.history.replaceState({}, document.title, window.location.pathname);
          onSuccess();
        }, 2000);
      } else {
        setMessage({ text: data.message || 'Có lỗi xảy ra', type: 'error' });
      }
    } catch (error) {
      setMessage({
        text: 'Không thể kết nối đến server. Vui lòng thử lại sau.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        <p className="text-slate-600 font-medium">Đang xác minh token...</p>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="space-y-4 animate-in fade-in zoom-in-95">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Token không hợp lệ</h2>
          <p className="text-slate-600 text-sm">
            Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
          </p>
        </div>

        {message && (
          <div className="p-4 rounded-2xl text-sm font-bold bg-rose-50 text-rose-700 border border-rose-200">
            ⚠️ {message.text}
          </div>
        )}

        <button
          onClick={() => {
            // Xóa token khỏi URL trước khi quay lại đăng nhập
            window.history.replaceState({}, document.title, window.location.pathname);
            onBackToLogin();
          }}
          className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
        >
          QUAY LẠI ĐĂNG NHẬP
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in zoom-in-95">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Đặt lại mật khẩu</h2>
        <p className="text-slate-600 text-sm">
          Tạo mật khẩu mới cho tài khoản <strong>{email}</strong>
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-sm font-bold ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}>
          {message.type === 'success' ? '✅' : '⚠️'} {message.text}
        </div>
      )}

      <input
        required
        type="password"
        placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
        value={newPassword}
        onChange={e => setNewPassword(e.target.value)}
        className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner"
        disabled={isLoading}
        minLength={6}
      />

      <input
        required
        type="password"
        placeholder="Xác nhận mật khẩu mới"
        value={confirmPassword}
        onChange={e => setConfirmPassword(e.target.value)}
        className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner"
        disabled={isLoading}
        minLength={6}
      />

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'ĐANG CẬP NHẬT...' : 'ĐẶT LẠI MẬT KHẨU'}
      </button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              window.history.replaceState({}, document.title, window.location.pathname);
              onBackToLogin();
            }}
            className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-all"
          >
            ← Quay lại đăng nhập
          </button>
        </div>

      <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-200">
        <h3 className="text-sm font-bold text-amber-800 mb-2">🔒 Lưu ý bảo mật:</h3>
        <ul className="text-xs text-amber-700 space-y-1">
          <li>• Mật khẩu phải có ít nhất 6 ký tự</li>
          <li>• Sử dụng mật khẩu mạnh với chữ hoa, chữ thường và số</li>
          <li>• Không chia sẻ mật khẩu với người khác</li>
        </ul>
      </div>
    </form>
  );
});

ResetPasswordForm.displayName = 'ResetPasswordForm';

export default ResetPasswordForm;