import React, { memo, useCallback, useMemo, useState } from 'react';

type SetupStep = 0 | 1 | 2 | 3;
type StorageProvider = 'none' | 'imgbb' | 'cloudinary' | 's3';
type EmailProvider = 'none' | 'brevo' | 'sendgrid' | 'both';

const steps = ['Cơ sở dữ liệu', 'Tài khoản admin', 'Khóa bảo mật', 'Dịch vụ tùy chọn'];
const specialKeyCharacters = "!@#$%^&*()-_=+[]{}?.,:;/\\|~`'\"";

interface FirstRunWizardProps {
  onComplete: () => void;
  databaseConnected: boolean;
  adminRequired: boolean;
  encryptionKeyConfigured: boolean;
}

const FirstRunWizard: React.FC<FirstRunWizardProps> = memo(function FirstRunWizard({
  onComplete,
  databaseConnected,
  adminRequired: initialAdminRequired,
  encryptionKeyConfigured,
}) {
  const existingAdminDetected = databaseConnected && !initialAdminRequired;
  const [databaseStepRequired, setDatabaseStepRequired] = useState(!databaseConnected);
  const [step, setStep] = useState<SetupStep>(() => !databaseConnected ? 0 : initialAdminRequired ? 1 : encryptionKeyConfigured ? 3 : 2);
  const [setupToken, setSetupToken] = useState('');
  const [databaseUri, setDatabaseUri] = useState('');
  const [databaseVerified, setDatabaseVerified] = useState(false);
  const [adminRequired, setAdminRequired] = useState(initialAdminRequired);
  const [admin, setAdmin] = useState({ username: '', email: '', fullName: '', password: '' });
  const [encryptionKey, setEncryptionKey] = useState('');
  const [showEncryptionKey, setShowEncryptionKey] = useState(false);
  const [keyBackedUp, setKeyBackedUp] = useState(false);
  const [storageProvider, setStorageProvider] = useState<StorageProvider>('none');
  const [storageConfig, setStorageConfig] = useState({
    apiKey: '',
    cloudName: '',
    apiSecret: '',
    accessKey: '',
    secretKey: '',
    bucket: '',
    region: '',
  });
  const [emailProvider, setEmailProvider] = useState<EmailProvider>('none');
  const [emailConfig, setEmailConfig] = useState({
    brevoApiKey: '',
    sendgridApiKey: '',
    senderEmail: '',
    senderName: 'Lucky Hub',
    appBaseUrl: window.location.origin,
  });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const visibleSteps = useMemo(() => [
    ...(databaseStepRequired ? [0 as SetupStep] : []),
    ...(adminRequired ? [1 as SetupStep] : []),
    ...(!encryptionKeyConfigured ? [2 as SetupStep] : []),
    3 as SetupStep,
  ], [adminRequired, databaseStepRequired, encryptionKeyConfigured]);

  const validEncryptionKey = useMemo(() => encryptionKey.length >= 8
    && encryptionKey.length <= 256
    && /[A-Z]/.test(encryptionKey)
    && /[a-z]/.test(encryptionKey)
    && /[0-9]/.test(encryptionKey)
    && [...encryptionKey].some(character => specialKeyCharacters.includes(character)), [encryptionKey]);

  const updateAdmin = useCallback((field: keyof typeof admin, value: string) => {
    setAdmin(current => ({ ...current, [field]: value }));
  }, []);

  const updateStorageConfig = useCallback((field: keyof typeof storageConfig, value: string) => {
    setStorageConfig(current => ({ ...current, [field]: value }));
  }, []);

  const updateEmailConfig = useCallback((field: keyof typeof emailConfig, value: string) => {
    setEmailConfig(current => ({ ...current, [field]: value }));
  }, []);

  const sendSetupRequest = useCallback(async (url: string, body?: unknown) => {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-setup-token': setupToken.trim(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Yêu cầu setup thất bại.');
    return result;
  }, [setupToken]);

  const testDatabase = useCallback(async () => {
    setError('');
    setNotice('');
    setIsBusy(true);
    try {
      const result = await sendSetupRequest('/api/setup/test-database', { databaseUri });
      setDatabaseVerified(true);
      setAdminRequired(result.adminRequired);
      setNotice('Kết nối MongoDB thành công. Bạn có thể tiếp tục.');
      console.info('[FirstRunSetup] MongoDB connection verified.');
    } catch (requestError) {
      setDatabaseVerified(false);
      setError(requestError instanceof Error ? requestError.message : 'Không thể kết nối MongoDB.');
      console.error('[FirstRunSetup] MongoDB verification failed.');
    } finally {
      setIsBusy(false);
    }
  }, [databaseUri, sendSetupRequest]);

  const generateKey = useCallback(async () => {
    setError('');
    setNotice('');
    setIsBusy(true);
    try {
      const result = await sendSetupRequest('/api/setup/generate-key');
      setEncryptionKey(result.encryptionKey);
      setShowEncryptionKey(true);
      setKeyBackedUp(false);
      setNotice('Đã tạo khóa ngẫu nhiên. Hãy sao lưu khóa trước khi tiếp tục.');
      console.info('[FirstRunSetup] Generated a new encryption key.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tạo khóa mã hóa.');
      console.error('[FirstRunSetup] Encryption key generation failed.');
    } finally {
      setIsBusy(false);
    }
  }, [sendSetupRequest]);

  const copyEncryptionKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(encryptionKey);
      setNotice('Đã sao chép khóa. Hãy lưu bản backup ở nơi an toàn.');
    } catch {
      setShowEncryptionKey(true);
      setError('Không thể truy cập clipboard. Khóa đã được hiển thị để bạn sao chép thủ công.');
    }
  }, [encryptionKey]);

  const completeSetup = useCallback(async (skipOptional = false) => {
    setError('');
    setNotice('');
    setIsBusy(true);
    try {
      if (existingAdminDetected) {
        await sendSetupRequest('/api/setup/complete', {});
        console.info('[FirstRunSetup] Existing database setup marker completed.');
        onComplete();
        return;
      }

      const providers = [];
      if ((emailProvider === 'brevo' || emailProvider === 'both') && emailConfig.brevoApiKey.trim()) {
        providers.push({ provider: 'brevo', apiKey: emailConfig.brevoApiKey.trim() });
      }
      if ((emailProvider === 'sendgrid' || emailProvider === 'both') && emailConfig.sendgridApiKey.trim()) {
        providers.push({ provider: 'sendgrid', apiKey: emailConfig.sendgridApiKey.trim() });
      }

      const payload = {
        databaseUri: databaseStepRequired ? databaseUri : '',
        admin: adminRequired ? admin : undefined,
        encryptionKey: encryptionKeyConfigured ? '' : encryptionKey,
        storage: skipOptional || storageProvider === 'none' ? undefined : { provider: storageProvider, config: storageConfig },
        email: skipOptional ? undefined : {
          providers,
          senderEmail: emailConfig.senderEmail,
          senderName: emailConfig.senderName,
          appBaseUrl: emailConfig.appBaseUrl,
        },
      };
      await sendSetupRequest('/api/setup/complete', payload);
      setEncryptionKey('');
      setShowEncryptionKey(false);
      console.info('[FirstRunSetup] Setup completed successfully.');
      onComplete();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể hoàn tất setup.');
      console.error('[FirstRunSetup] Setup completion failed.');
    } finally {
      setIsBusy(false);
    }
  }, [admin, adminRequired, databaseStepRequired, databaseUri, emailConfig, emailProvider, encryptionKey, encryptionKeyConfigured, existingAdminDetected, onComplete, sendSetupRequest, storageConfig, storageProvider]);

  const goToStep = (target: SetupStep) => {
    setError('');
    setNotice('');
    setStep(target);
  };

  const goToNextStep = () => {
    const currentIndex = visibleSteps.indexOf(step);
    if (currentIndex >= 0 && currentIndex < visibleSteps.length - 1) {
      setError('');
      setNotice('');
      setStep(visibleSteps[currentIndex + 1]);
    }
  };

  const goToPreviousStep = () => {
    const currentIndex = visibleSteps.indexOf(step);
    if (currentIndex > 0) {
      setError('');
      setNotice('');
      setStep(visibleSteps[currentIndex - 1]);
    }
  };

  const continueAfterDatabase = () => {
    setDatabaseStepRequired(false);
    const remainingSteps = visibleSteps.filter(item => item !== 0);
    setStep(remainingSteps[0]);
    setError('');
    setNotice('');
  };

  const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
  const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';
  const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';
  const buttonClass = 'inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50';
  const secondaryButtonClass = 'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-100 via-slate-50 to-sky-100 px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-2xl text-white shadow-lg">L</div>
          <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-emerald-700">Lucky Hub 2026</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Chào mừng bạn bắt đầu</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Hoàn tất vài bước để kết nối MongoDB, tạo tài khoản quản trị và cài đặt các dịch vụ cần thiết.
          </p>
        </header>

        {databaseConnected && (
          <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Đã tự động kiểm tra và kết nối MongoDB bằng `MONGODB_URI` trong môi trường. Bỏ qua bước cấu hình cơ sở dữ liệu.
          </div>
        )}

        <section className={cardClass}>
          {existingAdminDetected ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-extrabold">Database và tài khoản quản trị đã sẵn sàng</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Đã kết nối MongoDB và tìm thấy tài khoản có quyền quản trị. Hoàn tất bước này để lưu marker setup; dữ liệu và cấu hình hiện có sẽ được giữ nguyên.
                </p>
              </div>
              <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 px-4">
                <div className="flex items-center justify-between gap-4 py-3 text-sm">
                  <dt className="text-slate-600">Kết nối MongoDB</dt>
                  <dd className="font-semibold text-emerald-700">Đã kết nối</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3 text-sm">
                  <dt className="text-slate-600">Tài khoản quản trị</dt>
                  <dd className="font-semibold text-emerald-700">Đã phát hiện</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3 text-sm">
                  <dt className="text-slate-600">Marker first-run setup</dt>
                  <dd className="font-semibold text-amber-700">Chưa hoàn tất</dd>
                </div>
              </dl>
              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
              {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
              <button type="button" className={buttonClass} onClick={() => completeSetup(true)} disabled={isBusy}>
                {isBusy ? 'Đang hoàn tất…' : 'Hoàn tất setup'}
              </button>
            </div>
          ) : (
            <>
          <div className="mb-7 grid grid-cols-4 gap-2" aria-label="Tiến trình setup">
            {visibleSteps.map((stepId, index) => (
              <div key={stepId} className="min-w-0">
                <div className={`mb-2 h-1.5 rounded-full ${index <= visibleSteps.indexOf(step) ? 'bg-emerald-600' : 'bg-slate-200'}`} />
                <span className={`block truncate text-[11px] font-bold sm:text-xs ${stepId === step ? 'text-emerald-800' : 'text-slate-500'}`}>
                  {index + 1}. {steps[stepId]}
                </span>
              </div>
            ))}
          </div>

          {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
          {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-extrabold">Kết nối cơ sở dữ liệu</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Giai đoạn này hỗ trợ MongoDB, bao gồm MongoDB Atlas. Tài khoản database cần quyền tạo collection và index.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="setup-token">Mã truy cập setup</label>
                <input id="setup-token" className={`${inputClass} uppercase tracking-widest`} value={setupToken} onChange={event => setSetupToken(event.target.value.toUpperCase())} autoComplete="off" placeholder="Mã trong log máy chủ (mặc định 6 ký tự in hoa)" />
                <p className="mt-1.5 text-xs text-slate-500">Mã này bảo vệ bước cài đặt khỏi người truy cập trái phép. Có thể đặt LUCKY_HUB_SETUP_TOKEN trong cấu hình môi trường.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="database-uri">MongoDB connection URI</label>
                <input id="database-uri" className={inputClass} type="password" value={databaseUri} onChange={event => { setDatabaseUri(event.target.value); setDatabaseVerified(false); }} autoComplete="off" placeholder="mongodb+srv://user:password@cluster.example.mongodb.net/lucky_hub" />
                <p className="mt-1.5 text-xs text-slate-500">Thông tin xác thực được lưu trong file cấu hình cục bộ có giới hạn quyền truy cập. Hãy mã hóa URI nếu chia sẻ log hoặc sao lưu file.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" className={secondaryButtonClass} onClick={testDatabase} disabled={isBusy || !setupToken.trim() || !databaseUri.trim()}>
                  {isBusy ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
                </button>
                <button type="button" className={buttonClass} onClick={continueAfterDatabase} disabled={!databaseVerified}>Tiếp tục</button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-extrabold">Tạo tài khoản quản trị</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Tài khoản này được gán đầy đủ quyền quản trị. Mật khẩu tối thiểu 12 ký tự.</p>
              </div>
              {!databaseStepRequired && (
                <div>
                  <label className={labelClass} htmlFor="setup-token-admin">Mã truy cập setup</label>
                  <input id="setup-token-admin" className={`${inputClass} uppercase tracking-widest`} value={setupToken} onChange={event => setSetupToken(event.target.value)} autoComplete="off" placeholder="6 ký tự in hoa từ log máy chủ" />
                  <p className="mt-1.5 text-xs text-slate-500">Nhập mã 6 ký tự in hoa trong log server để xác nhận quyền setup.</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="admin-full-name">Tên hiển thị</label>
                  <input id="admin-full-name" className={inputClass} value={admin.fullName} onChange={event => updateAdmin('fullName', event.target.value)} autoComplete="name" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="admin-username">Tên đăng nhập</label>
                  <input id="admin-username" className={inputClass} value={admin.username} onChange={event => updateAdmin('username', event.target.value)} autoComplete="username" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="admin-email">Email</label>
                  <input id="admin-email" className={inputClass} type="email" value={admin.email} onChange={event => updateAdmin('email', event.target.value)} autoComplete="email" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="admin-password">Mật khẩu</label>
                  <input id="admin-password" className={inputClass} type="password" value={admin.password} onChange={event => updateAdmin('password', event.target.value)} autoComplete="new-password" />
                </div>
              </div>
              <div className="flex justify-between">
                {visibleSteps.indexOf(step) > 0 && <button type="button" className={secondaryButtonClass} onClick={goToPreviousStep}>Quay lại</button>}
                <button type="button" className={buttonClass} onClick={goToNextStep} disabled={(!databaseStepRequired && !setupToken.trim()) || admin.fullName.trim().length < 2 || admin.username.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email) || admin.password.length < 12}>
                  Tiếp tục
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-extrabold">Khóa mã hóa AI_ENCRYPTION_KEY</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Khóa này bảo vệ API keys, token và dữ liệu bí mật được mã hóa trong database. Bạn có thể tạo khóa ngẫu nhiên hoặc tự đặt khóa riêng.</p>
              </div>
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <strong>Cảnh báo quan trọng:</strong> hãy backup khóa ở nơi an toàn trước khi tiếp tục. Nếu mất khóa, các dữ liệu đã mã hóa không thể khôi phục/giải mã; cần tạo khóa mới và nhập lại các secrets. Khóa chỉ được hiển thị trong bước setup này và không thể xem lại sau khi hoàn tất.
              </div>
              <div>
                <label className={labelClass} htmlFor="encryption-key">Khóa tùy chỉnh hoặc khóa đã tạo</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input id="encryption-key" className={`${inputClass} font-mono`} type={showEncryptionKey ? 'text' : 'password'} value={encryptionKey} onChange={event => { setEncryptionKey(event.target.value); setKeyBackedUp(false); }} autoComplete="new-password" />
                  <button type="button" className={secondaryButtonClass} onClick={generateKey} disabled={isBusy || !setupToken.trim()}>{isBusy ? 'Đang tạo…' : 'Tạo khóa ngẫu nhiên'}</button>
                </div>
                <p className="mt-2 text-xs text-slate-500">Tối thiểu 8 ký tự, bắt buộc có chữ hoa, chữ thường, số và ký tự đặc biệt. Khóa được xử lý bằng scrypt; khóa 32-byte base64 cũ vẫn tương thích.</p>
                {!!encryptionKey && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" className={secondaryButtonClass} onClick={() => setShowEncryptionKey(current => !current)}>{showEncryptionKey ? 'Ẩn khóa' : 'Hiện khóa'}</button>
                    <button type="button" className={secondaryButtonClass} onClick={copyEncryptionKey}>Sao chép khóa</button>
                    <span className={`text-xs font-semibold ${validEncryptionKey ? 'text-emerald-700' : 'text-rose-700'}`}>{validEncryptionKey ? 'Độ phức tạp đạt yêu cầu' : 'Khóa chưa đạt yêu cầu'}</span>
                  </div>
                )}
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                <input className="mt-1 h-4 w-4 accent-emerald-700" type="checkbox" checked={keyBackedUp} onChange={event => setKeyBackedUp(event.target.checked)} />
                <span>Tôi đã sao lưu khóa này ở nơi an toàn và hiểu rằng nếu mất khóa, dữ liệu đã mã hóa sẽ không thể khôi phục.</span>
              </label>
              <div className="flex justify-between">
                {visibleSteps.indexOf(step) > 0 && <button type="button" className={secondaryButtonClass} onClick={goToPreviousStep}>Quay lại</button>}
                <button type="button" className={buttonClass} onClick={() => goToStep(3)} disabled={!validEncryptionKey || !keyBackedUp}>Tiếp tục</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-extrabold">Dịch vụ tùy chọn</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Bạn có thể bỏ qua những dịch vụ này và cấu hình sau trong trang quản trị. Secrets được mã hóa trước khi lưu vào MongoDB.</p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <label className={labelClass} htmlFor="storage-provider">Lưu trữ hình ảnh (logo, avatar và bài viết)</label>
                <select id="storage-provider" className={inputClass} value={storageProvider} onChange={event => setStorageProvider(event.target.value as StorageProvider)}>
                  <option value="none">Bỏ qua / cấu hình sau</option>
                  <option value="imgbb">ImgBB</option>
                  <option value="cloudinary">Cloudinary</option>
                  <option value="s3">Amazon S3</option>
                </select>
                {storageProvider === 'imgbb' && <div className="mt-4"><label className={labelClass} htmlFor="imgbb-key">ImgBB API key</label><input id="imgbb-key" className={inputClass} type="password" value={storageConfig.apiKey} onChange={event => updateStorageConfig('apiKey', event.target.value)} autoComplete="off" /></div>}
                {storageProvider === 'cloudinary' && <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div><label className={labelClass} htmlFor="cloudinary-name">Cloud name</label><input id="cloudinary-name" className={inputClass} value={storageConfig.cloudName} onChange={event => updateStorageConfig('cloudName', event.target.value)} /></div>
                  <div><label className={labelClass} htmlFor="cloudinary-key">API key</label><input id="cloudinary-key" className={inputClass} type="password" value={storageConfig.apiKey} onChange={event => updateStorageConfig('apiKey', event.target.value)} autoComplete="off" /></div>
                  <div className="sm:col-span-2"><label className={labelClass} htmlFor="cloudinary-secret">API secret</label><input id="cloudinary-secret" className={inputClass} type="password" value={storageConfig.apiSecret} onChange={event => updateStorageConfig('apiSecret', event.target.value)} autoComplete="off" /></div>
                </div>}
                {storageProvider === 's3' && <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div><label className={labelClass} htmlFor="s3-access">Access key ID</label><input id="s3-access" className={inputClass} type="password" value={storageConfig.accessKey} onChange={event => updateStorageConfig('accessKey', event.target.value)} autoComplete="off" /></div>
                  <div><label className={labelClass} htmlFor="s3-secret">Secret access key</label><input id="s3-secret" className={inputClass} type="password" value={storageConfig.secretKey} onChange={event => updateStorageConfig('secretKey', event.target.value)} autoComplete="off" /></div>
                  <div><label className={labelClass} htmlFor="s3-bucket">Bucket</label><input id="s3-bucket" className={inputClass} value={storageConfig.bucket} onChange={event => updateStorageConfig('bucket', event.target.value)} /></div>
                  <div><label className={labelClass} htmlFor="s3-region">Region</label><input id="s3-region" className={inputClass} value={storageConfig.region} onChange={event => updateStorageConfig('region', event.target.value)} placeholder="ap-southeast-1" /></div>
                </div>}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <label className={labelClass} htmlFor="email-provider">Gửi email</label>
                <select id="email-provider" className={inputClass} value={emailProvider} onChange={event => setEmailProvider(event.target.value as EmailProvider)}>
                  <option value="none">Bỏ qua / cấu hình sau</option>
                  <option value="brevo">Brevo</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="both">Cả Brevo và SendGrid (Brevo ưu tiên)</option>
                </select>
                {(emailProvider === 'brevo' || emailProvider === 'both') && <div className="mt-4"><label className={labelClass} htmlFor="brevo-key">Brevo API key</label><input id="brevo-key" className={inputClass} type="password" value={emailConfig.brevoApiKey} onChange={event => updateEmailConfig('brevoApiKey', event.target.value)} autoComplete="off" /></div>}
                {(emailProvider === 'sendgrid' || emailProvider === 'both') && <div className="mt-4"><label className={labelClass} htmlFor="sendgrid-key">SendGrid API key</label><input id="sendgrid-key" className={inputClass} type="password" value={emailConfig.sendgridApiKey} onChange={event => updateEmailConfig('sendgridApiKey', event.target.value)} autoComplete="off" /></div>}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div><label className={labelClass} htmlFor="sender-name">Tên người gửi</label><input id="sender-name" className={inputClass} value={emailConfig.senderName} onChange={event => updateEmailConfig('senderName', event.target.value)} /></div>
                  <div><label className={labelClass} htmlFor="sender-email">Email người gửi</label><input id="sender-email" className={inputClass} type="email" value={emailConfig.senderEmail} onChange={event => updateEmailConfig('senderEmail', event.target.value)} /></div>
                  <div className="sm:col-span-2"><label className={labelClass} htmlFor="app-base-url">URL ứng dụng (dùng cho link xác thực/reset mật khẩu)</label><input id="app-base-url" className={inputClass} type="url" value={emailConfig.appBaseUrl} onChange={event => updateEmailConfig('appBaseUrl', event.target.value)} placeholder="https://your-domain.example" /></div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Việc tạo collection và index, nhóm quyền admin, tài khoản quản trị và cài đặt dịch vụ sẽ được thực hiện sau khi bạn hoàn tất. Hãy đảm bảo database mới chưa có người dùng.
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                {visibleSteps.indexOf(step) > 0 && <button type="button" className={secondaryButtonClass} onClick={goToPreviousStep}>Quay lại</button>}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" className={secondaryButtonClass} onClick={() => completeSetup(true)} disabled={isBusy}>{isBusy ? 'Đang cài đặt…' : 'Bỏ qua dịch vụ tùy chọn'}</button>
                  <button type="button" className={buttonClass} onClick={() => completeSetup(false)} disabled={isBusy
                    || (storageProvider !== 'none' && Object.entries(storageConfig).some(([field, value]) => {
                      const required = storageProvider === 'imgbb' ? ['apiKey'] : storageProvider === 'cloudinary' ? ['cloudName', 'apiKey', 'apiSecret'] : ['accessKey', 'secretKey', 'bucket', 'region'];
                      return required.includes(field) && !value.trim();
                    }))
                    || ((emailProvider === 'brevo' || emailProvider === 'both') && !emailConfig.brevoApiKey.trim())
                    || ((emailProvider === 'sendgrid' || emailProvider === 'both') && !emailConfig.sendgridApiKey.trim())}>
                    {isBusy ? 'Đang cài đặt…' : 'Hoàn tất setup'}
                  </button>
                </div>
              </div>
            </div>
          )}
            </>
          )}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Cấu hình ban đầu được lưu trong thư mục dữ liệu của máy chủ. Hãy gắn ổ đĩa bền vững khi triển khai trên dịch vụ có filesystem tạm thời.
        </p>
      </div>
    </main>
  );
});

FirstRunWizard.displayName = 'FirstRunWizard';

export default FirstRunWizard;
