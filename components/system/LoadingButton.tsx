import React, { memo, useState, useCallback } from 'react';

interface LoadingButtonProps {
  children: React.ReactNode;
  onClick?: () => Promise<void> | void;
  className?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  loadingText?: string;
  type?: 'button' | 'submit';
  title?: string;
}

const variantClasses: Record<string, string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100',
  secondary: 'bg-slate-100 text-slate-400 hover:bg-slate-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200',
  success: 'bg-green-600 text-white hover:bg-green-700',
  warning: 'bg-amber-500 text-white hover:bg-amber-600',
};

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-2 text-[9px] rounded-xl',
  md: 'px-5 py-3 text-[10px] rounded-2xl',
  lg: 'px-6 py-4 text-[11px] rounded-2xl',
};

const LoadingButton: React.FC<LoadingButtonProps> = memo(({
  children,
  onClick,
  className = '',
  disabled = false,
  variant = 'primary',
  size = 'md',
  loadingText,
  type = 'button',
  title,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (isLoading || disabled || !onClick) return;
    setIsLoading(true);
    try {
      await onClick();
    } finally {
      setIsLoading(false);
    }
  }, [onClick, isLoading, disabled]);

  const baseClass = `${variantClasses[variant]} ${sizeClasses[size]} font-black uppercase tracking-wider transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2`;

  return (
    <button
      type={type}
      onClick={type === 'submit' ? undefined : handleClick}
      disabled={disabled || isLoading}
      title={title}
      className={`${baseClass} ${className} ${isLoading ? 'cursor-wait' : 'cursor-pointer'}`}
    >
      {isLoading ? (
        <>
          <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>{loadingText || 'Đang xử lý...'}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

LoadingButton.displayName = 'LoadingButton';
export default LoadingButton;