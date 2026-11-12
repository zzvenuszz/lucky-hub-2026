import React, { useState, useEffect, useCallback, memo } from 'react';
import { Database } from '../../services/database.ts';
import SystemBrandingSettings from './SystemBrandingSettings.tsx';

interface SystemSettingsProps {
  currentUser: any;
  onRefresh: () => void;
}

interface EmailProvider {
  _id: string;
  provider: string;
  apiKey: string;
  isActive: boolean;
  priority: number;
  label: string;
  createdAt: string;
  updatedAt: string;
}

interface StorageProvider {
  _id: string;
  provider: string;
  config: {
    apiKey?: string;
    cloudName?: string;
    apiSecret?: string;
    accessKey?: string;
    secretKey?: string;
    bucket?: string;
    region?: string;
    [key: string]: any;
  };
  isActive: boolean;
  priority: number;
  label: string;
  createdAt: string;
  updatedAt: string;
}

interface MagicMirrorToken {
  id: string;
  name: string;
  tokenPrefix: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
}

interface SystemSettingsData {
  email: {
    providers: EmailProvider[];
    senderEmail: string;
    senderName: string;
    appBaseUrl: string;
    updatedBy: string;
    _id: string;
    updatedAt: string;
  };
  storage: {
    providers: StorageProvider[];
    updatedBy: string;
    _id: string;
    updatedAt: string;
  };
  ai: {
    encryptionKey: string;
    geminiProxyUrl: string;
    updatedBy: string;
    _id: string;
    updatedAt: string;
  };
}

const SystemSettings: React.FC<SystemSettingsProps> = function SystemSettings({ currentUser, onRefresh }: SystemSettingsProps) {
  const [activeSection, setActiveSection] = useState<'email' | 'storage' | 'ai-keys' | 'magic-mirror' | 'branding'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [magicMirrorTokens, setMagicMirrorTokens] = useState<MagicMirrorToken[]>([]);
  const [isLoadingMagicMirrorTokens, setIsLoadingMagicMirrorTokens] = useState(false);
  const [hasLoadedMagicMirrorTokens, setHasLoadedMagicMirrorTokens] = useState(false);
  const [showMagicMirrorTokenForm, setShowMagicMirrorTokenForm] = useState(false);
  const [editingMagicMirrorToken, setEditingMagicMirrorToken] = useState<MagicMirrorToken | null>(null);
  const [magicMirrorTokenName, setMagicMirrorTokenName] = useState('');
  const [magicMirrorTokenExpiry, setMagicMirrorTokenExpiry] = useState('');
  const [newMagicMirrorSecret, setNewMagicMirrorSecret] = useState('');

  const [showAddEmailProvider, setShowAddEmailProvider] = useState(false);
  const [showAddStorageProvider, setShowAddStorageProvider] = useState(false);
  const [editingEmailProvider, setEditingEmailProvider] = useState<EmailProvider | null>(null);

  const [emailForm, setEmailForm] = useState({
    provider: 'brevo',
    apiKey: '',
    label: '',
    isActive: true,
    priority: 1,
  });
  const [storageForm, setStorageForm] = useState({
    provider: 'imgbb',
    apiKey: '',
    label: '',
    isActive: true,
    priority: 1,
  });

  const getAuthHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
    };
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/system-settings', {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      setSettings(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const loadMagicMirrorTokens = useCallback(async () => {
    setIsLoadingMagicMirrorTokens(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/magic-mirror-tokens', {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể tải danh sách token.');
      setMagicMirrorTokens(data);
      setHasLoadedMagicMirrorTokens(true);
    } catch (err: any) {
      setHasLoadedMagicMirrorTokens(false);
      setError(err.message || 'Không thể tải danh sách token.');
    } finally {
      setIsLoadingMagicMirrorTokens(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (activeSection === 'magic-mirror') loadMagicMirrorTokens();
  }, [activeSection, loadMagicMirrorTokens]);

  const clearMessages = () => { setError(null); setSuccess(null); };

  const saveMagicMirrorToken = async () => {
    const name = magicMirrorTokenName.trim();
    if (!name) {
      setError('Vui lòng nhập tên token.');
      return;
    }

    setIsLoading(true);
    clearMessages();
    try {
      const isEditing = Boolean(editingMagicMirrorToken);
      const response = await fetch(
        isEditing
          ? `/api/admin/magic-mirror-tokens/${editingMagicMirrorToken!.id}`
          : '/api/admin/magic-mirror-tokens',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name,
            expiresAt: magicMirrorTokenExpiry || null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể lưu token.');

      if (isEditing) {
        setSuccess('Đã cập nhật token Magic Mirror.');
      } else {
        setNewMagicMirrorSecret(data.secret);
        setSuccess('Đã tạo token. Hãy sao chép và cập nhật cấu hình hai module Magic Mirror.');
      }
      setShowMagicMirrorTokenForm(false);
      setEditingMagicMirrorToken(null);
      setMagicMirrorTokenName('');
      setMagicMirrorTokenExpiry('');
      await loadMagicMirrorTokens();
    } catch (err: any) {
      setError(err.message || 'Không thể lưu token.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyMagicMirrorToken = async (token: MagicMirrorToken) => {
    setIsLoading(true);
    clearMessages();
    try {
      const response = await fetch(`/api/admin/magic-mirror-tokens/${token.id}/reveal`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể lấy token.');
      try {
        await navigator.clipboard.writeText(data.secret);
      } catch {
        setNewMagicMirrorSecret(data.secret);
        throw new Error('Không thể truy cập clipboard. Token đã được hiển thị để bạn sao chép thủ công.');
      }
      setSuccess(`Đã sao chép token "${token.name}".`);
    } catch (err: any) {
      setError(err.message || 'Không thể sao chép token.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMagicMirrorToken = async (token: MagicMirrorToken) => {
    setIsLoading(true);
    clearMessages();
    try {
      const response = await fetch(`/api/admin/magic-mirror-tokens/${token.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !token.isActive }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể đổi trạng thái token.');
      setMagicMirrorTokens(prev => prev.map(item => item.id === token.id ? data.token : item));
      setSuccess(data.token.isActive ? 'Đã bật token.' : 'Đã chặn token.');
    } catch (err: any) {
      setError(err.message || 'Không thể đổi trạng thái token.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteMagicMirrorToken = async (token: MagicMirrorToken) => {
    if (!confirm(`Xóa token "${token.name}"? Thiết bị đang sử dụng token này sẽ mất quyền truy cập.`)) return;
    setIsLoading(true);
    clearMessages();
    try {
      const response = await fetch(`/api/admin/magic-mirror-tokens/${token.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể xóa token.');
      setMagicMirrorTokens(prev => prev.filter(item => item.id !== token.id));
      setSuccess('Đã xóa token Magic Mirror.');
    } catch (err: any) {
      setError(err.message || 'Không thể xóa token.');
    } finally {
      setIsLoading(false);
    }
  };

  const editMagicMirrorToken = (token: MagicMirrorToken) => {
    setEditingMagicMirrorToken(token);
    setMagicMirrorTokenName(token.name);
    setMagicMirrorTokenExpiry(token.expiresAt ? new Date(token.expiresAt).toISOString().slice(0, 10) : '');
    setShowMagicMirrorTokenForm(true);
    clearMessages();
  };

  const saveSettings = async (section: 'email' | 'storage' | 'ai') => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ [section]: settings?.[section] }),
      });
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setSuccess('Đã lưu cài đặt!');
      } else {
        setError(data.message || 'Lưu thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Lưu thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailProviderChange = (field: string, value: any) => {
    setEmailForm(prev => ({ ...prev, [field]: value }));
  };

  const handleStorageProviderChange = (field: string, value: any) => {
    setStorageForm(prev => ({ ...prev, [field]: value }));
  };

  const addEmailProvider = async () => {
    if (!emailForm.apiKey || !emailForm.label) {
      setError('Vui lòng nhập API Key và Label');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: {
            ...settings?.email,
            providers: [...(settings?.email.providers || []), {
              provider: emailForm.provider,
              apiKey: emailForm.apiKey,
              label: emailForm.label,
              isActive: emailForm.isActive,
              priority: emailForm.priority,
            }]
          }
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setSuccess('Đã thêm email provider!');
        setShowAddEmailProvider(false);
        setEmailForm({ provider: 'brevo', apiKey: '', label: '', isActive: true, priority: 1 });
      } else {
        setError(data.message || 'Thêm thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Thêm thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const editEmailProvider = (provider: EmailProvider) => {
    setEditingEmailProvider(provider);
    setEmailForm({
      provider: provider.provider,
      apiKey: '',
      label: provider.label,
      isActive: provider.isActive,
      priority: provider.priority,
    });
    setShowAddEmailProvider(true);
  };

  const updateEmailProvider = async () => {
    if (!emailForm.label) {
      setError('Vui lòng nhập Label');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const updatedProviders = settings?.email.providers.map(p =>
        p._id === editingEmailProvider?._id
          ? {
              ...p,
              label: emailForm.label,
              isActive: emailForm.isActive,
              priority: emailForm.priority,
              apiKey: emailForm.apiKey || p.apiKey,
            }
          : p
      ) || [];
      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: { ...settings?.email, providers: updatedProviders }
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setSuccess('Đã cập nhật email provider!');
        setEditingEmailProvider(null);
        setShowAddEmailProvider(false);
        setEmailForm({ provider: 'brevo', apiKey: '', label: '', isActive: true, priority: 1 });
      } else {
        setError(data.message || 'Cập nhật thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Cập nhật thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteEmailProvider = async (providerId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa provider này?')) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/system-settings/email/${providerId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setSettings(prev => prev ? {
          ...prev,
          email: { ...prev.email, providers: prev.email.providers.filter(p => p._id !== providerId) }
        } : null);
        setSuccess('Đã xóa email provider!');
      } else {
        setError(data.message || 'Xóa thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Xóa thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const addStorageProvider = async () => {
    if (!storageForm.label || (storageForm.provider !== 's3' && !storageForm.apiKey)) {
      setError(storageForm.provider === 's3' ? 'Vui lòng nhập Label.' : 'Vui lòng nhập API Key và Label.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          storage: {
            ...settings?.storage,
            providers: [
              ...(settings?.storage.providers || []).map(provider => ({
                ...provider,
                isActive: storageForm.isActive ? false : provider.isActive,
              })),
              {
                provider: storageForm.provider,
                config: { apiKey: storageForm.apiKey },
                label: storageForm.label,
                isActive: storageForm.isActive,
                priority: storageForm.priority,
              },
            ]
          }
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setSuccess('Đã thêm storage provider!');
        setShowAddStorageProvider(false);
        setStorageForm({ provider: 'imgbb', apiKey: '', label: '', isActive: true, priority: 1 });
      } else {
        setError(data.message || 'Thêm thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Thêm thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteStorageProvider = async (providerId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa provider này?')) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/system-settings/storage/${providerId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setSettings(prev => prev ? {
          ...prev,
          storage: { ...prev.storage, providers: prev.storage.providers.filter(p => p._id !== providerId) }
        } : null);
        setSuccess('Đã xóa storage provider!');
      } else {
        setError(data.message || 'Xóa thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Xóa thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestEmail = async (recipientEmail?: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    const activeProvider = settings?.email.providers.find(p => p.isActive);
    const providerId = activeProvider?._id;
    const toEmail = recipientEmail || (currentUser as any).email;
    const requestStartedAt = Date.now();
    console.log('[SystemSettings][EmailTest] 🚀 Step 1: Bắt đầu gửi email test:', {
      recipientProvided: !!toEmail,
      recipientDomain: typeof toEmail === 'string' && toEmail.includes('@') ? toEmail.split('@').pop() : 'invalid',
      providerId,
      providerName: activeProvider?.provider,
      providerLabel: activeProvider?.label,
      startedAt: new Date(requestStartedAt).toISOString(),
    });
    window.debugLog?.(`[EmailTest] Bắt đầu gửi email test (Provider: ${activeProvider?.provider || 'default'})`, 'info');
    try {
      const response = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          to: toEmail,
          subject: 'Test Email - Lucky Hub',
          html: '<p>Đây là email test từ Lucky Hub Admin Panel</p>',
          providerId,
        })
      });
      const responseText = await response.text();
      let data: any = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        data = { rawResponse: responseText };
        console.error('[SystemSettings][EmailTest] ❌ Không đọc được JSON response:', parseError);
      }
      console.log('[SystemSettings][EmailTest] 📥 Step 2: HTTP response nhận được:', {
        requestId: data.requestId || 'not-returned',
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        durationMs: Date.now() - requestStartedAt,
        contentType: response.headers.get('content-type'),
        payload: data,
      });
      if (Array.isArray(data.steps)) {
        data.steps.forEach((step: string, idx: number) => {
          console.log(`[SystemSettings][EmailTest]   ↳ Bước ${idx + 1}: ${step}`);
        });
      }
      if (data.details) {
        console.log('[SystemSettings][EmailTest] 📋 Chi tiết kết quả provider:', data.details);
        console.log('[SystemSettings][EmailTest] 📋 Kết quả từng provider:', data.details.attempts || {});
      }
      if (response.ok && data.success) {
        console.log('[SystemSettings][EmailTest] ✅ Step 3: Gửi email test thành công:', {
          requestId: data.requestId,
          providerUsed: data.providerUsed,
          message: data.message,
          durationMs: Date.now() - requestStartedAt,
        });
        window.debugLog?.(`[EmailTest] ✅ Gửi thành công qua ${data.providerUsed || activeProvider?.provider}`, 'success');
        setSuccess(data.message || 'Đã gửi email test thành công!');
      } else {
        const errMsg = data.message || `Gửi email thất bại (HTTP ${response.status})`;
        console.error('[SystemSettings][EmailTest] ❌ Step 3: Gửi email test thất bại:', {
          requestId: data.requestId,
          status: response.status,
          message: errMsg,
          durationMs: Date.now() - requestStartedAt,
          response: data,
        });
        window.debugLog?.(`[EmailTest] ❌ Thất bại: ${errMsg}`, 'error');
        setError(errMsg);
      }
    } catch (err: any) {
      console.error('[SystemSettings][EmailTest] ❌ Lỗi kết nối khi gửi email test:', {
        durationMs: Date.now() - requestStartedAt,
        errorName: err?.name,
        message: err?.message,
        error: err,
      });
      window.debugLog?.(`[EmailTest] ❌ Lỗi kết nối: ${err.message}`, 'error');
      setError(err.message || 'Gửi email thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const showTestEmailModal = () => {
    const recipient = prompt('Nhập email người nhận:', (currentUser as any).email);
    if (recipient) {
      sendTestEmail(recipient);
    }
  };

  const sendCustomTestEmail = async (providerId: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    const targetProvider = settings?.email.providers.find(p => p._id === providerId);
    const toEmail = (currentUser as any).email;
    const requestStartedAt = Date.now();
    console.log('[SystemSettings][CustomEmailTest] 🚀 Step 1: Bắt đầu gửi email test theo provider:', {
      recipientProvided: !!toEmail,
      recipientDomain: typeof toEmail === 'string' && toEmail.includes('@') ? toEmail.split('@').pop() : 'invalid',
      providerId,
      providerName: targetProvider?.provider,
      providerLabel: targetProvider?.label,
      startedAt: new Date(requestStartedAt).toISOString(),
    });
    window.debugLog?.(`[EmailTest] Bắt đầu test provider ${targetProvider?.provider || providerId}`, 'info');
    try {
      const response = await fetch('/api/admin/test-email/custom', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          to: toEmail,
          subject: 'Custom Test Email',
          html: '<h1>Custom Test</h1><p>This is a custom test email from the admin panel</p>',
          providerId,
        })
      });
      const responseText = await response.text();
      let data: any = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        data = { rawResponse: responseText };
        console.error('[SystemSettings][CustomEmailTest] ❌ Không đọc được JSON response:', parseError);
      }
      console.log('[SystemSettings][CustomEmailTest] 📥 Step 2: HTTP response nhận được:', {
        requestId: data.requestId || 'not-returned',
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        durationMs: Date.now() - requestStartedAt,
        contentType: response.headers.get('content-type'),
        payload: data,
      });
      if (Array.isArray(data.steps)) {
        data.steps.forEach((step: string, idx: number) => {
          console.log(`[SystemSettings][CustomEmailTest]   ↳ Bước ${idx + 1}: ${step}`);
        });
      }
      if (data.details) {
        console.log('[SystemSettings][CustomEmailTest] 📋 Chi tiết kết quả provider:', data.details);
        console.log('[SystemSettings][CustomEmailTest] 📋 Kết quả từng provider:', data.details.attempts || {});
      }
      if (response.ok && data.success) {
        console.log('[SystemSettings][CustomEmailTest] ✅ Step 3: Gửi email tùy chỉnh thành công:', {
          requestId: data.requestId,
          providerUsed: data.providerUsed,
          message: data.message,
          durationMs: Date.now() - requestStartedAt,
        });
        window.debugLog?.(`[EmailTest] ✅ Test provider ${data.providerUsed || targetProvider?.provider} thành công!`, 'success');
        setSuccess(data.message || 'Đã gửi email tùy chỉnh thành công!');
      } else {
        const errMsg = data.message || `Gửi email thất bại (HTTP ${response.status})`;
        console.error('[SystemSettings][CustomEmailTest] ❌ Step 3: Gửi email tùy chỉnh thất bại:', {
          requestId: data.requestId,
          status: response.status,
          message: errMsg,
          durationMs: Date.now() - requestStartedAt,
          response: data,
        });
        window.debugLog?.(`[EmailTest] ❌ Thất bại: ${errMsg}`, 'error');
        setError(errMsg);
      }
    } catch (err: any) {
      console.error('[SystemSettings][CustomEmailTest] ❌ Lỗi kết nối khi gửi email tùy chỉnh:', {
        durationMs: Date.now() - requestStartedAt,
        errorName: err?.name,
        message: err?.message,
        error: err,
      });
      window.debugLog?.(`[EmailTest] ❌ Lỗi kết nối: ${err.message}`, 'error');
      setError(err.message || 'Gửi email thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const testStorage = async (providerId?: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/admin/test-storage', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ providerId })
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(`Test storage thành công: ${data.url}`);
      } else {
        setError(data.message || 'Test storage thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Test storage thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const maskValue = (value: string) => {
    if (!value || value === 'Chưa cấu hình') return 'Chưa cấu hình';
    if (value.startsWith('....')) return value;
    if (value.length <= 8) return '........';
    return value.substring(0, 4) + '........' + value.substring(value.length - 4);
  };

  if (isLoading && !settings) {
    return <div className="p-8 text-center text-slate-400">Đang tải...</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col items-start gap-4">
        <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">Cài đặt Hệ thống</h3>
        <div className="flex w-full flex-nowrap gap-1 md:w-auto md:flex-wrap md:gap-2">
          {[
            { id: 'email', label: 'Email', icon: '📧' },
            { id: 'storage', label: 'Lưu trữ ảnh', icon: '🖼️' },
            { id: 'ai-keys', label: 'AI Keys', icon: '🔑' },
            { id: 'magic-mirror', label: 'CẤU HÌNH MAGIC MIRROR', icon: '🪞' },
            { id: 'branding', label: 'THÔNG TIN CƠ BẢN', icon: '🎨' },
          ].map(section => (
            <button
              key={section.id}
              onClick={() => { setActiveSection(section.id as any); clearMessages(); }}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-2 text-[9px] font-bold uppercase transition-all md:w-auto md:flex-none md:flex-col md:gap-0 md:px-4 md:text-sm ${
                activeSection === section.id
                  ? 'flex-[5] bg-emerald-600 text-white shadow md:flex-none'
                  : 'flex-1 bg-slate-100 text-slate-600 hover:bg-slate-200 md:flex-none'
              }`}
            >
              <span className="block text-base">{section.icon}</span>
              <span className={activeSection === section.id ? 'inline whitespace-nowrap' : 'hidden md:inline'}>{section.label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4">
          <p className="text-rose-700 font-medium">Lỗi: {error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
          <p className="text-emerald-700 font-medium">Thành công: {success}</p>
        </div>
      )}

      {activeSection === 'branding' && <SystemBrandingSettings />}

      {/* Email Settings */}
      {activeSection === 'email' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50/50 border-b border-slate-100">
              <h4 className="font-black text-slate-700 uppercase tracking-widest text-sm flex items-center gap-2">
                <span className="text-lg">📧</span> Cấu hình Email Service
              </h4>
            </div>
            <div className="p-5 space-y-5">
              {/* Email Providers List */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Email Providers</label>
                <div className="space-y-3">
                  {settings?.email.providers.map((provider, index) => (
                    <div key={provider._id} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-center text-slate-400 font-bold">{index + 1}</span>
                          <span className="font-bold text-slate-800 capitalize">{provider.provider}</span>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${provider.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {provider.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                          </span>
                          <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-500">Priority: {provider.priority}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => editEmailProvider(provider)}
                            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => deleteEmailProvider(provider._id)}
                            className="px-3 py-1.5 bg-rose-100 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-200"
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                        <div>
                          <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">API Key</label>
                          <input
                            type="password"
                            placeholder={provider.apiKey ? 'Giữ nguyên key hiện tại' : 'Nhập API Key mới'}
                            className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                            onChange={(e) => {
                              const updatedProviders = settings?.email.providers.map(p =>
                                p._id === provider._id ? { ...p, apiKey: e.target.value } : p
                              ) || [];
                              setSettings(prev => prev ? { ...prev, email: { ...prev.email, providers: updatedProviders } } : null);
                            }}
                          />
                          <p className="text-xs text-slate-400 mt-1"> Để trống để giữ nguyên key hiện tại</p>
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Label</label>
                          <input
                            type="text"
                            value={provider.label}
                            onChange={(e) => {
                              const updatedProviders = settings?.email.providers.map(p =>
                                p._id === provider._id ? { ...p, label: e.target.value } : p
                              ) || [];
                              setSettings(prev => prev ? { ...prev, email: { ...prev.email, providers: updatedProviders } } : null);
                            }}
                            className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Priority</label>
                          <input
                            type="number" inputMode="numeric"
                            value={provider.priority}
                            onChange={(e) => {
                              const updatedProviders = settings?.email.providers.map(p =>
                                p._id === provider._id ? { ...p, priority: parseInt(e.target.value) } : p
                              ) || [];
                              setSettings(prev => prev ? { ...prev, email: { ...prev.email, providers: updatedProviders } } : null);
                            }}
                            min="1"
                            className="w-20 px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-center"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={provider.isActive}
                            onChange={(e) => {
                              const updatedProviders = settings?.email.providers.map(p =>
                                p._id === provider._id ? { ...p, isActive: e.target.checked } : p
                              ) || [];
                              setSettings(prev => prev ? { ...prev, email: { ...prev.email, providers: updatedProviders } } : null);
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-slate-600">Active</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => { setShowAddEmailProvider(true); setEditingEmailProvider(null); clearMessages(); }}
                className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200"
              >
                Thêm Email Provider
              </button>

              {showAddEmailProvider && (
                <div className="bg-white p-4 rounded-xl border border-emerald-200 space-y-4">
                  <h5 className="font-black text-slate-700 uppercase tracking-widest text-sm">
                    {editingEmailProvider ? `Sửa provider: ${editingEmailProvider.provider}` : 'Thêm Email Provider'}
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Provider</label>
                      <select
                        value={emailForm.provider}
                        onChange={(e) => handleEmailProviderChange('provider', e.target.value)}
                        disabled={!!editingEmailProvider}
                        className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium disabled:bg-slate-50"
                      >
                        <option value="brevo">Brevo</option>
                        <option value="sendgrid">SendGrid</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Label</label>
                      <input
                        type="text"
                        value={emailForm.label}
                        onChange={(e) => handleEmailProviderChange('label', e.target.value)}
                        placeholder="Ví dụ: Brevo (Primary)"
                        className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">API Key</label>
                      <input
                        type="password"
                        value={emailForm.apiKey}
                        onChange={(e) => handleEmailProviderChange('apiKey', e.target.value)}
                        placeholder={editingEmailProvider ? 'Để trống để giữ nguyên key hiện tại' : 'Nhập API Key'}
                        className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Priority</label>
                      <input
                        type="number" inputMode="numeric"
                        min="1"
                        value={emailForm.priority}
                        onChange={(e) => handleEmailProviderChange('priority', parseInt(e.target.value) || 1)}
                        className="w-24 px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-center"
                      />
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={emailForm.isActive}
                        onChange={(e) => handleEmailProviderChange('isActive', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-slate-600">Active</span>
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={editingEmailProvider ? updateEmailProvider : addEmailProvider}
                      disabled={isLoading}
                      className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase shadow disabled:opacity-50"
                    >
                      {editingEmailProvider ? 'Cập nhật' : 'Thêm'}
                    </button>
                    <button
                      onClick={() => { setShowAddEmailProvider(false); setEditingEmailProvider(null); clearMessages(); }}
                      className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-200"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {/* Email Settings */}
              <div className="pt-4 border-t border-slate-100">
                <h5 className="font-black text-slate-700 uppercase tracking-widest text-sm mb-3">Cấu hình chung</h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Email gửi (Sender)</label>
                    <input
                      type="email"
                      value={settings?.email.senderEmail || ''}
                      onChange={(e) => setSettings(prev => prev ? { ...prev, email: { ...prev.email, senderEmail: e.target.value } } : null)}
                      placeholder="luckyhubvn@gmail.com"
                      className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Tên người gửi</label>
                    <input
                      type="text"
                      value={settings?.email.senderName || ''}
                      onChange={(e) => setSettings(prev => prev ? { ...prev, email: { ...prev.email, senderName: e.target.value } } : null)}
                      placeholder="Lucky Hub"
                      className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">App Base URL</label>
                    <input
                      type="url"
                      value={settings?.email.appBaseUrl || ''}
                      onChange={(e) => setSettings(prev => prev ? { ...prev, email: { ...prev.email, appBaseUrl: e.target.value } } : null)}
                      placeholder="https://lucky-hub-2026.onrender.com"
                      className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={showTestEmailModal}
                  disabled={isLoading}
                  className="px-4 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-sm shadow disabled:opacity-50"
                >
                  {isLoading ? 'Đang test...' : 'Test Email'}
                </button>
                <button
                  onClick={() => saveSettings('email')}
                  disabled={isLoading}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-sm shadow disabled:opacity-50"
                >
                  {isLoading ? 'Đang lưu...' : 'Lưu cấu hình Email'}
                </button>
                <button
                  onClick={() => { clearMessages(); }}
                  className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-sm hover:bg-slate-200"
                >
                  Làm mới
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Storage Settings */}
      {activeSection === 'storage' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50/50 border-b border-slate-100">
              <h4 className="font-black text-slate-700 uppercase tracking-widest text-sm flex items-center gap-2">
                <span className="text-lg">💾</span> Cấu hình Lưu trữ Ảnh
              </h4>
            </div>
            <div className="p-5 space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="font-black text-amber-700 text-sm mb-2">⚠️ Lưu ý quan trọng</p>
                <ul className="text-sm text-amber-600 space-y-1 list-disc list-inside">
                  <li>Chỉ chọn <strong>một</strong> provider lưu trữ ảnh đang hoạt động</li>
                  <li>Nếu có nhiều provider hoạt động, provider có Priority nhỏ nhất được chọn</li>
                  <li>Các key được lưu trong database (mã hóa), .env là key dự phòng</li>
                  <li>Bucket S3 cần cho phép đọc ảnh công khai để hiển thị logo hệ thống</li>
                </ul>
              </div>

              {/* Storage Providers List */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Storage Providers</label>
                <div className="space-y-3">
                  {settings?.storage.providers.map((provider, index) => (
                    <div key={provider._id} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-center text-slate-400 font-bold">{index + 1}</span>
                          <span className="font-bold text-slate-800 capitalize">{provider.provider}</span>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => setSettings(prev => prev ? {
                              ...prev,
                              storage: {
                                ...prev.storage,
                                providers: prev.storage.providers.map(item => ({
                                  ...item,
                                  isActive: item._id === provider._id,
                                })),
                              },
                            } : null)}
                            className={`px-2 py-1 rounded text-xs font-bold ${provider.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'}`}
                          >
                            {provider.isActive ? 'Đang sử dụng' : 'Dùng provider này'}
                          </button>
                          <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-500">Priority: {provider.priority}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => deleteStorageProvider(provider._id)}
                            className="px-3 py-1.5 bg-rose-100 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-200"
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                        {provider.provider === 'imgbb' && (
                          <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">API Key</label>
                            <input
                              type="password"
                              placeholder={provider.config?.apiKey ? 'Giữ nguyên key hiện tại' : 'Nhập API Key mới'}
                              className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                              onChange={(e) => {
                                const updatedProviders = settings?.storage.providers.map(p =>
                                  p._id === provider._id ? { ...p, config: { ...p.config, apiKey: e.target.value } } : p
                                ) || [];
                                setSettings(prev => prev ? { ...prev, storage: { ...prev.storage, providers: updatedProviders } } : null);
                              }}
                            />
                            <p className="text-xs text-slate-400 mt-1"> Để trống để giữ nguyên key hiện tại</p>
                          </div>
                        )}
                        {provider.provider === 'cloudinary' && (
                          <>
                            <div>
                              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Cloud Name</label>
                              <input
                                type="text"
                                value={provider.config?.cloudName || ''}
                                onChange={(e) => {
                                  const updatedProviders = settings?.storage.providers.map(p =>
                                    p._id === provider._id ? { ...p, config: { ...p.config, cloudName: e.target.value } } : p
                                  ) || [];
                                  setSettings(prev => prev ? { ...prev, storage: { ...prev.storage, providers: updatedProviders } } : null);
                                }}
                                className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">API Key</label>
                              <input
                                type="password"
                                placeholder={provider.config?.apiKey ? 'Giữ nguyên key hiện tại' : 'Nhập API Key mới'}
                                className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                onChange={(e) => {
                                  const updatedProviders = settings?.storage.providers.map(p =>
                                    p._id === provider._id ? { ...p, config: { ...p.config, apiKey: e.target.value } } : p
                                  ) || [];
                                  setSettings(prev => prev ? { ...prev, storage: { ...prev.storage, providers: updatedProviders } } : null);
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">API Secret</label>
                              <input
                                type="password"
                                placeholder={provider.config?.apiSecret ? 'Giữ nguyên key hiện tại' : 'Nhập API Secret mới'}
                                className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                onChange={(e) => {
                                  const updatedProviders = settings?.storage.providers.map(p =>
                                    p._id === provider._id ? { ...p, config: { ...p.config, apiSecret: e.target.value } } : p
                                  ) || [];
                                  setSettings(prev => prev ? { ...prev, storage: { ...prev.storage, providers: updatedProviders } } : null);
                                }}
                              />
                            </div>
                          </>
                        )}
                        {provider.provider === 's3' && (
                          <>
                            <div>
                              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Access Key</label>
                              <input
                                type="password"
                                value={provider.config?.accessKey?.includes('••••') ? '' : provider.config?.accessKey || ''}
                                placeholder={provider.config?.accessKey ? 'Giữ nguyên key hiện tại' : 'Nhập Access Key'}
                                onChange={(e) => {
                                  const updatedProviders = settings?.storage.providers.map(p =>
                                    p._id === provider._id ? { ...p, config: { ...p.config, accessKey: e.target.value } } : p
                                  ) || [];
                                  setSettings(prev => prev ? { ...prev, storage: { ...prev.storage, providers: updatedProviders } } : null);
                                }}
                                className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Secret Key</label>
                              <input
                                type="password"
                                placeholder={provider.config?.secretKey ? 'Giữ nguyên key hiện tại' : 'Nhập Secret Key mới'}
                                className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                onChange={(e) => {
                                  const updatedProviders = settings?.storage.providers.map(p =>
                                    p._id === provider._id ? { ...p, config: { ...p.config, secretKey: e.target.value } } : p
                                  ) || [];
                                  setSettings(prev => prev ? { ...prev, storage: { ...prev.storage, providers: updatedProviders } } : null);
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Bucket</label>
                              <input
                                type="text"
                                value={provider.config?.bucket || ''}
                                onChange={(e) => {
                                  const updatedProviders = settings?.storage.providers.map(p =>
                                    p._id === provider._id ? { ...p, config: { ...p.config, bucket: e.target.value } } : p
                                  ) || [];
                                  setSettings(prev => prev ? { ...prev, storage: { ...prev.storage, providers: updatedProviders } } : null);
                                }}
                                className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Region</label>
                              <input
                                type="text"
                                value={provider.config?.region || ''}
                                onChange={(e) => {
                                  const updatedProviders = settings?.storage.providers.map(p =>
                                    p._id === provider._id ? { ...p, config: { ...p.config, region: e.target.value } } : p
                                  ) || [];
                                  setSettings(prev => prev ? { ...prev, storage: { ...prev.storage, providers: updatedProviders } } : null);
                                }}
                                className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => { setShowAddStorageProvider(true); clearMessages(); }}
                className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200"
              >
                Thêm Storage Provider
              </button>

              {showAddStorageProvider && (
                <div className="bg-white p-4 rounded-xl border border-emerald-200 space-y-4">
                  <h5 className="font-black text-slate-700 uppercase tracking-widest text-sm">Thêm Storage Provider</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Provider</label>
                      <select
                        value={storageForm.provider}
                        onChange={(e) => handleStorageProviderChange('provider', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                      >
                        <option value="imgbb">ImgBB</option>
                        <option value="cloudinary">Cloudinary</option>
                        <option value="s3">S3</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Label</label>
                      <input
                        type="text"
                        value={storageForm.label}
                        onChange={(e) => handleStorageProviderChange('label', e.target.value)}
                        placeholder="Ví dụ: ImgBB (Primary)"
                        className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                      />
                    </div>
                    {storageForm.provider !== 's3' && (
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">API Key</label>
                        <input
                          type="password"
                          value={storageForm.apiKey}
                          onChange={(e) => handleStorageProviderChange('apiKey', e.target.value)}
                          placeholder="Nhập API Key"
                          className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Priority</label>
                      <input
                        type="number" inputMode="numeric"
                        min="1"
                        value={storageForm.priority}
                        onChange={(e) => handleStorageProviderChange('priority', parseInt(e.target.value) || 1)}
                        className="w-24 px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-center"
                      />
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={storageForm.isActive}
                        onChange={(e) => handleStorageProviderChange('isActive', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-slate-600">Active</span>
                    </label>
                  </div>
                  <p className="text-xs text-slate-400">
                    Provider Cloudinary / S3 cần thêm cấu hình riêng (cloud name, secret, bucket...). Sau khi thêm, các ô đó hiện ra ngay trong danh sách bên trên để chỉnh.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={addStorageProvider}
                      disabled={isLoading}
                      className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase shadow disabled:opacity-50"
                    >
                      Thêm
                    </button>
                    <button
                      onClick={() => { setShowAddStorageProvider(false); clearMessages(); }}
                      className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-200"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-3">
                <button
                  onClick={() => saveSettings('storage')}
                  disabled={isLoading}
                  className="flex-1 min-w-[180px] py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-sm shadow disabled:opacity-50"
                >
                  {isLoading ? 'Đang lưu...' : 'Lưu cấu hình lưu trữ'}
                </button>
                <button
                  onClick={() => testStorage()}
                  disabled={isLoading}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-sm shadow disabled:opacity-50"
                >
                  {isLoading ? 'Đang test...' : 'Test Upload Ảnh'}
                </button>
                <button
                  onClick={() => { clearMessages(); }}
                  className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-sm hover:bg-slate-200"
                >
                  Làm mới
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Keys Settings */}
      {activeSection === 'ai-keys' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50/50 border-b border-slate-100">
              <h4 className="font-black text-slate-700 uppercase tracking-widest text-sm flex items-center gap-2">
                <span className="text-lg">🔑 AI Keys</span> AI Encryption & Proxy
              </h4>
            </div>
            <div className="p-5 space-y-5">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4">
                <p className="font-black text-rose-700 text-sm mb-2">⚠️ Cảnh báo bảo mật</p>
                <ul className="text-sm text-rose-600 space-y-1 list-disc list-inside">
                  <li>AI_ENCRYPTION_KEY dùng để mã hóa API keys trong database</li>
                  <li><strong>Không bao giờ đổi key này sau khi đã có dữ liệu</strong> - sẽ mất khả năng giải mã</li>
                  <li>Backup key này ở nơi an toàn</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">AI Encryption Key</label>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-sm text-slate-600 flex items-center justify-between">
                  <span>{maskValue(settings?.ai.encryptionKey || '')}</span>
                  <span className="text-xs text-slate-400">(32 bytes base64)</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Tạo mới: <code className="bg-slate-100 px-2 py-1 rounded">node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"</code></p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Gemini Proxy URL (Render)</label>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-sm text-slate-600">
                  {settings?.ai.geminiProxyUrl || 'Chưa cấu hình'}
                </div>
                <p className="text-xs text-slate-400 mt-1">Dùng để vượt rào cản địa lý Google API từ Render. Format: http://proxy-host:port</p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => { clearMessages(); }}
                  className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-sm hover:bg-slate-200"
                >
                  Làm mới
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'magic-mirror' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="font-black text-slate-700 uppercase tracking-widest text-sm flex items-center gap-2">
                  <span className="text-lg">🪞</span> CẤU HÌNH MAGIC MIRROR
                </h4>
                <p className="text-xs text-slate-500 mt-2">Mỗi thiết bị có thể dùng token riêng. Token hết hạn hoặc bị tắt sẽ không thể kết nối.</p>
              </div>
              <button
                onClick={() => {
                  setEditingMagicMirrorToken(null);
                  setMagicMirrorTokenName('');
                  setMagicMirrorTokenExpiry('');
                  setShowMagicMirrorTokenForm(true);
                  clearMessages();
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
              >
                Tạo token mới
              </button>
            </div>

            {newMagicMirrorSecret && (
              <div className="m-5 p-4 rounded-xl border border-amber-300 bg-amber-50 space-y-3">
                <p className="text-sm font-bold text-amber-900">Token mới — hãy cấu hình vào cả hai module Magic Mirror.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    readOnly
                    value={newMagicMirrorSecret}
                    className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-amber-200 bg-white font-mono text-xs"
                    onFocus={event => event.currentTarget.select()}
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(newMagicMirrorSecret);
                        setSuccess('Đã sao chép token mới.');
                      } catch (err: any) {
                        setError(err.message || 'Không thể sao chép token.');
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold"
                  >
                    Sao chép
                  </button>
                  <button
                    onClick={() => setNewMagicMirrorSecret('')}
                    className="px-4 py-2 rounded-lg bg-white border border-amber-200 text-amber-800 text-xs font-bold"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}

            {showMagicMirrorTokenForm && (
              <div className="m-5 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-4">
                <h5 className="font-bold text-slate-800">{editingMagicMirrorToken ? 'Sửa token' : 'Tạo token Magic Mirror'}</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-slate-600">
                    Tên token
                    <input
                      maxLength={80}
                      value={magicMirrorTokenName}
                      onChange={event => setMagicMirrorTokenName(event.target.value)}
                      placeholder="Ví dụ: Magic Mirror phòng khách"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Ngày hết hạn (để trống nếu không hết hạn)
                    <input
                      type="date"
                      value={magicMirrorTokenExpiry}
                      onChange={event => setMagicMirrorTokenExpiry(event.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveMagicMirrorToken}
                    disabled={isLoading}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                  >
                    {isLoading ? 'Đang lưu...' : editingMagicMirrorToken ? 'Lưu thay đổi' : 'Tạo token'}
                  </button>
                  <button
                    onClick={() => { setShowMagicMirrorTokenForm(false); setEditingMagicMirrorToken(null); }}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}

            <div className="p-5">
              {isLoadingMagicMirrorTokens ? (
                <p className="py-8 text-center text-sm text-slate-400">Đang tải token...</p>
              ) : !hasLoadedMagicMirrorTokens ? (
                <p className="py-8 text-center text-sm text-rose-500">Không thể tải danh sách token.</p>
              ) : magicMirrorTokens.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Chưa có token Magic Mirror.</p>
              ) : (
                <div className="space-y-3">
                  {magicMirrorTokens.map(token => {
                    const expired = token.expiresAt !== null && new Date(token.expiresAt).getTime() <= Date.now();
                    const active = token.isActive && !expired;
                    return (
                      <div key={token.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-800">{token.name}</span>
                            <span className={`px-2 py-1 rounded text-xs font-bold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {expired ? 'Đã hết hạn' : token.isActive ? 'Đang bật' : 'Đã chặn'}
                            </span>
                          </div>
                          <p className="font-mono text-xs text-slate-500">Token: {token.tokenPrefix}••••••••</p>
                          <p className="text-xs text-slate-500">
                            Tạo: {new Date(token.createdAt).toLocaleString('vi-VN')}
                            {' · '}
                            Hết hạn: {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString('vi-VN') : 'Không hết hạn'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => copyMagicMirrorToken(token)} disabled={isLoading} className="px-3 py-2 rounded-lg bg-sky-100 text-sky-700 text-xs font-bold disabled:opacity-50">Copy token</button>
                          <button onClick={() => toggleMagicMirrorToken(token)} disabled={isLoading} className={`px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50 ${token.isActive ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {token.isActive ? 'Chặn' : 'Cho phép'}
                          </button>
                          <button onClick={() => editMagicMirrorToken(token)} disabled={isLoading} className="px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-50">Sửa</button>
                          <button onClick={() => deleteMagicMirrorToken(token)} disabled={isLoading} className="px-3 py-2 rounded-lg bg-rose-100 text-rose-700 text-xs font-bold disabled:opacity-50">Xóa</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

SystemSettings.displayName = 'SystemSettings';
export default SystemSettings;
