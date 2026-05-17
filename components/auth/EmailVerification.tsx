import React, { useState, useEffect, memo } from 'react';

interface EmailVerificationProps {
  token: string;
  onVerified: () => void;
  onBackToLogin: () => void;
}

const EmailVerification: React.FC<EmailVerificationProps> = memo(({ token, onVerified, onBackToLogin }) => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Đang xác thực email của bạn...');

  useEffect(() => {
    if (!token) {
      setStatus('success');
      setMessage('Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.');
      return;
    }

    const verifyEmail = async () => {
      try {
        const resp = await fetch(`/api/verify-email/${token}`);
        const data = await resp.json();
        if (resp.ok) {
          setStatus('success');
          setMessage(data.message || 'Xác thực email thành công! Bạn có thể đăng nhập ngay.');
        } else {
          setStatus('error');
          setMessage(data.message || 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.');
        }
      } catch (err: any) {
        setStatus('error');
        setMessage('Lỗi kết nối. Vui lòng thử lại sau.');
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div className="animate-in fade-in zoom-in-95 text-center space-y-6">
      {status === 'verifying' && (
        <div className="py-8">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-bold">{message}</p>
        </div>
      )}

      {status === 'success' && (
        <div className="py-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">✅</span>
          </div>
          <h3 className="text-xl font-black text-emerald-700 mb-2">
            {token ? 'Xác thực thành công!' : 'Đăng ký thành công!'}
          </h3>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">{message}</p>
          <button
            onClick={onBackToLogin}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
          >
            {token ? 'ĐĂNG NHẬP NGAY' : 'QUAY LẠI ĐĂNG NHẬP'}
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="py-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">❌</span>
          </div>
          <h3 className="text-xl font-black text-red-600 mb-2">Xác thực thất bại</h3>
          <p className="text-slate-600 text-sm leading-relaxed mb-4">{message}</p>
          <p className="text-xs text-slate-400 mb-6">
            Liên kết xác thực có hiệu lực trong 24 giờ. Nếu đã hết hạn, vui lòng đăng nhập và yêu cầu gửi lại email xác thực.
          </p>
          <button
            onClick={onBackToLogin}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
          >
            QUAY LẠI ĐĂNG NHẬP
          </button>
        </div>
      )}
    </div>
  );
});

EmailVerification.displayName = 'EmailVerification';
export default EmailVerification;