import React, { useState, memo } from 'react';

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = memo(({ onBackToLogin }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({ text: 'Vui lòng nhập email', type: 'error' });
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setMessage({ text: 'Email không hợp lệ', type: 'error' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({
          text: 'Hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.',
          type: 'success'
        });
        setEmail('');
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in zoom-in-95">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Quên mật khẩu?</h2>
        <p className="text-slate-600 text-sm">
          Nhập email của bạn và chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu.
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
        type="email"
        placeholder="Nhập email của bạn"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm shadow-inner"
        disabled={isLoading}
      />

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'ĐANG GỬI...' : 'GỬI HƯỚNG DẪN'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={onBackToLogin}
          className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-all"
        >
          ← Quay lại đăng nhập
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-2xl border border-blue-200">
        <h3 className="text-sm font-bold text-blue-800 mb-2">📧 Hướng dẫn:</h3>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• Kiểm tra cả hộp thư chính và thư rác (spam)</li>
          <li>• Liên kết đặt lại mật khẩu có hiệu lực trong 1 giờ</li>
          <li>• Nếu không nhận được email, vui lòng thử lại sau 5 phút</li>
        </ul>
      </div>
    </form>
  );
});

ForgotPasswordForm.displayName = 'ForgotPasswordForm';

export default ForgotPasswordForm;