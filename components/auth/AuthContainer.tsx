import React, { useState, memo } from 'react';
import Login from './Login';
import Register from './Register';
import ForgotPasswordForm from './ForgotPasswordForm';
import ResetPasswordForm from './ResetPasswordForm';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

interface AuthContainerProps {
  onLogin: (data: any) => void;
  onRegister: (data: any) => void;
  isLoading: boolean;
  emailError: string | null;
  onCheckEmail: (email: string) => void;
  errorMessage?: string | null;
  lockUntil?: string | null;
}

const AuthContainer: React.FC<AuthContainerProps> = memo(({ onLogin, onRegister, isLoading, emailError, onCheckEmail, errorMessage, lockUntil }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [resetToken, setResetToken] = useState<string>('');

  const handleSwitchToRegister = () => setMode('register');
  const handleSwitchToLogin = () => setMode('login');
  const handleSwitchToForgotPassword = () => setMode('forgot-password');
  const handleResetPasswordSuccess = () => setMode('login');

  const handleResetPassword = (token: string) => {
    setResetToken(token);
    setMode('reset-password');
  };

  // Check if we have a reset token in URL
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token && mode === 'login') {
      // Xóa token khỏi URL sau khi lấy để tránh vòng lặp
      window.history.replaceState({}, document.title, window.location.pathname);
      handleResetPassword(token);
    }
  }, [mode]);

  const renderAuthForm = () => {
    switch (mode) {
      case 'register':
        return (
          <Register
            onRegister={onRegister}
            onSwitchLogin={handleSwitchToLogin}
            isLoading={isLoading}
            emailError={emailError}
            onCheckEmail={onCheckEmail}
          />
        );
      case 'forgot-password':
        return (
          <ForgotPasswordForm
            onBackToLogin={handleSwitchToLogin}
          />
        );
      case 'reset-password':
        return (
          <ResetPasswordForm
            token={resetToken}
            onSuccess={handleResetPasswordSuccess}
            onBackToLogin={handleSwitchToLogin}
          />
        );
      default:
        return (
          <Login
            onLogin={onLogin}
            onSwitchRegister={handleSwitchToRegister}
            onForgotPassword={handleSwitchToForgotPassword}
            isLoading={isLoading}
            errorMessage={errorMessage}
            lockUntil={lockUntil}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand - Bấm vào về trang chủ */}
        <a href="/" className="block text-center mb-8 no-underline">
          <div className="flex items-center justify-center mb-4">
            <img src="/favicon/luckyhub.png" alt="Lucky Hub" className="w-32 h-32 object-contain" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-2">LUCKY HUB</h1>
          <p className="text-slate-600 text-sm font-medium">Nền tảng quản lý dinh dưỡng thông minh</p>
        </a>

        {/* Auth Form Container */}
        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200 p-8 border border-slate-100">
          {renderAuthForm()}
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-slate-400">
            © 2026 Lucky Hub. Bảo mật và đáng tin cậy.
          </p>
        </div>
      </div>
    </div>
  );
});

AuthContainer.displayName = 'AuthContainer';

export default AuthContainer;