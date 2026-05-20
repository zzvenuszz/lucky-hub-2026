import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught an error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
            <div className="text-6xl mb-4">😵</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">Có lỗi xảy ra</h2>
            <p className="text-slate-500 text-sm mb-6">
              Ứng dụng đã gặp sự cố. Vui lòng thử tải lại trang.
            </p>
            {this.state.error && (
              <details className="text-left mb-4">
                <summary className="text-xs font-bold text-slate-400 cursor-pointer mb-2">Chi tiết lỗi (kỹ thuật)</summary>
                <pre className="text-[10px] text-rose-500 bg-rose-50 p-3 rounded-xl overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
                {this.state.errorInfo && (
                  <pre className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded-xl overflow-auto max-h-32 mt-2">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-wider text-xs hover:bg-emerald-700 transition-all"
              >
                🔄 Thử lại
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase tracking-wider text-xs hover:bg-slate-200 transition-all"
              >
                🔁 Tải lại trang
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;