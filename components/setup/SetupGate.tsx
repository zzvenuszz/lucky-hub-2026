import React, { memo, useCallback, useEffect, useState } from 'react';
import App from '../../App.tsx';
import FirstRunWizard from './FirstRunWizard.tsx';

type SetupState = 'loading' | 'required' | 'ready' | 'error';
interface SetupStatus {
  databaseConnected: boolean;
  adminRequired: boolean;
  encryptionKeyConfigured: boolean;
}

const SetupGate: React.FC = memo(function SetupGate() {
  const [state, setState] = useState<SetupState>('loading');
  const [error, setError] = useState('');
  const [setupStatus, setSetupStatus] = useState<SetupStatus>({
    databaseConnected: false,
    adminRequired: true,
    encryptionKeyConfigured: false,
  });

  const checkSetup = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      const response = await fetch('/api/setup/status', {
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Không thể kiểm tra trạng thái setup.');
      setSetupStatus({
        databaseConnected: result.databaseConnected === true,
        adminRequired: result.adminRequired !== false,
        encryptionKeyConfigured: result.encryptionKeyConfigured === true,
      });
      setState(result.setupRequired ? 'required' : 'ready');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể kết nối máy chủ.');
      setState('error');
      console.error('[FirstRunSetup] Setup state check failed.');
    }
  }, []);

  useEffect(() => {
    void checkSetup();
  }, [checkSetup]);

  const handleComplete = useCallback(() => {
    setState('ready');
  }, []);

  if (state === 'required') return <FirstRunWizard onComplete={handleComplete} {...setupStatus} />;
  if (state === 'ready') return <App />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-800">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-700" aria-hidden="true" />
        {state === 'error' ? (
          <>
            <h1 className="text-lg font-bold">Không thể tải ứng dụng</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <button type="button" className="mt-5 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white" onClick={checkSetup}>Thử lại</button>
          </>
        ) : <p className="text-sm font-semibold text-slate-600">Đang kiểm tra trạng thái cài đặt…</p>}
      </div>
    </main>
  );
});

SetupGate.displayName = 'SetupGate';

export default SetupGate;
