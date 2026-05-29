import React, { memo } from 'react';

interface RegistrationSuccessProps {
  email: string;
  onBackToLogin: () => void;
}

const RegistrationSuccess: React.FC<RegistrationSuccessProps> = memo(({ email, onBackToLogin }) => {
  return (
    <div className="animate-in fade-in zoom-in-95 text-center space-y-6 py-6">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-4xl">🎉</span>
      </div>
      <h3 className="text-xl font-black text-emerald-700 mb-2">
        Đăng ký thành công!
      </h3>
      <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
        <p>
          Chúc mừng bạn đã đăng ký tài khoản <strong>Lucky Hub</strong> thành công!
        </p>
        <p>
          Một email chứa thông tin tài khoản đã được gửi đến:
        </p>
        <p className="font-bold text-emerald-700 bg-emerald-50 py-2 px-4 rounded-lg inline-block">
          {email}
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4 text-left">
          <p className="text-amber-800 font-bold text-xs mb-2">📧 Đã gửi: Thông tin đăng nhập</p>
          <p className="text-amber-700 text-xs">
            Email bao gồm tên đăng nhập, mật khẩu và link truy cập. Vui lòng kiểm tra hộp thư đến (Inbox) hoặc mục Spam.
          </p>
        </div>
        <p className="text-xs text-slate-400 pt-2">
          Lưu ý: Yêu cầu tham gia Nhóm Dinh Dưỡng (NDD) của bạn sẽ được chủ vận hành xem xét và phê duyệt sau.
        </p>
      </div>
      <button
        onClick={onBackToLogin}
        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
      >
        ĐĂNG NHẬP NGAY
      </button>
    </div>
  );
});

RegistrationSuccess.displayName = 'RegistrationSuccess';
export default RegistrationSuccess;