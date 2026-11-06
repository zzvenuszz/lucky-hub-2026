import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Database } from '../../../services/database.ts';

interface AIProvider {
  _id: string;
  providerId: string;
  name: string;
  isEnabled: boolean;
  baseUrl: string;
  customHeaders: Array<{ key: string; value: string; isSecret: boolean }>;
  selectedModelIds: string[];
  strategy: 'round-robin' | 'fallback' | 'priority';
  defaultTimeoutMs: number;
  defaultRetries: number;
  apiKeys: Array<{
    _id: string;
    label: string;
    isActive: boolean;
    priority: number;
    lastUsed?: string;
    failCount: number;
    cooldownUntil?: string;
    maskedKey: string;
  }>;
  activeKeysCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface DiscoveredModel {
  modelId: string;
  displayName: string;
  isFreeTier: boolean;
  capabilities: {
    vision?: boolean;
    [key: string]: any;
  };
}

/**
 * MultiSelectDropdown - Dropdown với checkbox bên trong để chọn nhiều item
 */
const MultiSelectDropdown: React.FC<{
  options: DiscoveredModel[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxDisplay?: number;
}> = ({ options, selectedValues, onChange, placeholder = '-- Chọn model --', maxDisplay = 3 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    onChange(newValues);
  };

  const toggleAll = () => {
    if (selectedValues.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(o => o.modelId));
    }
  };

  const displayText = selectedValues.length === 0
    ? placeholder
    : selectedValues.length <= maxDisplay
      ? options.filter(o => selectedValues.includes(o.modelId)).map(o => o.displayName).join(', ')
      : `${selectedValues.length} models selected`;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 font-medium text-left flex items-center justify-between"
      >
        <span className={selectedValues.length === 0 ? 'text-slate-400' : 'text-slate-700'}>{displayText}</span>
        <svg className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-80 overflow-auto">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Models ({options.length})</span>
            <button
              type="button"
              onClick={toggleAll}
              className="px-2 py-1 text-xs font-bold text-emerald-600 hover:text-emerald-500"
            >
              {selectedValues.length === options.length ? '❌ Bỏ chọn tất cả' : '✅ Chọn tất cả'}
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {options.map((option) => {
              const isSelected = selectedValues.includes(option.modelId);
              return (
                <label
                  key={option.modelId}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition ${
                    isSelected ? 'bg-purple-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOption(option.modelId)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className={`${option.isFreeTier ? 'text-emerald-700' : 'text-slate-700'} flex-1 truncate`}>
                    {option.isFreeTier ? '🆓 ' : ''}{option.displayName}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">
                    {option.capabilities?.vision ? '👁️ Vision' : '💬 Chat'}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

MultiSelectDropdown.displayName = 'MultiSelectDropdown';

interface ProviderDefinition {
  id: string;
  name: string;
  baseUrl: string;
  modelsEndpoint: string;
  authType: string;
  defaultTimeoutMs: number;
  defaultRetries: number;
  freeModels: string[];
  visionModels: string[];
  requiresCustomUrl: boolean;
  description: string;
}

const AIProviderPanel: React.FC = memo(() => {
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'edit'>('list');
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [definitions, setDefinitions] = useState<ProviderDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state for adding/editing provider
  const [formData, setFormData] = useState({
    _id: '',
    providerId: 'google',
    name: '',
    baseUrl: '',
    customHeaders: [] as Array<{ key: string; value: string; isSecret: boolean }>,
    selectedModelIds: [] as string[],
    strategy: 'fallback' as 'round-robin' | 'fallback' | 'priority',
    defaultTimeoutMs: 45000,
    defaultRetries: 2,
    apiKeys: [] as Array<{ _id?: string; key: string; label: string; isActive: boolean; priority: number; maskedKey?: string }>,
  });

  // Inline discover state
  const [discoveredModels, setDiscoveredModels] = useState<any[]>([]);
  const [isDiscoveringInline, setIsDiscoveringInline] = useState(false);
  const [lastDiscoveredProviderId, setLastDiscoveredProviderId] = useState<string | null>(null);

  // Test connection result state
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [providersData, defsData] = await Promise.all([
        Database.getAIProviders(),
        Database.getProviderDefinitions(),
      ]);
      setProviders(providersData);
      setDefinitions(defsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load providers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEditProvider = (provider: AIProvider) => {
    setFormData({
      _id: provider._id,
      providerId: provider.providerId,
      name: provider.name,
      baseUrl: provider.baseUrl,
      customHeaders: provider.customHeaders.map(h => ({ ...h, value: h.isSecret ? '' : h.value })),
      selectedModelIds: provider.selectedModelIds,
      strategy: provider.strategy,
      defaultTimeoutMs: provider.defaultTimeoutMs,
      defaultRetries: provider.defaultRetries,
      apiKeys: provider.apiKeys.map(k => ({
        _id: k._id,
        key: '', // Don't show encrypted key
        label: k.label,
        isActive: k.isActive,
        priority: k.priority,
        maskedKey: k.maskedKey,
      })),
    });
    setDiscoveredModels([]);
    setLastDiscoveredProviderId(null);
    setTestResult(null);
    setError(null);
    setSuccess(null);
    setActiveTab('edit');
  };

  const resetForm = () => {
    setFormData({
      _id: '',
      providerId: 'google',
      name: '',
      baseUrl: '',
      customHeaders: [],
      selectedModelIds: [],
      strategy: 'fallback',
      defaultTimeoutMs: 45000,
      defaultRetries: 2,
      apiKeys: [],
    });
    setDiscoveredModels([]);
    setLastDiscoveredProviderId(null);
    setTestResult(null);
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  // Inline discover models for current provider
  const handleDiscoverInline = async () => {
    const def = definitions.find(d => d.id === formData.providerId);
    if (!def) return;

    // For known providers, use def.baseUrl; for custom/selfhosted, use formData.baseUrl
    const baseUrl = def.requiresCustomUrl ? formData.baseUrl : def.baseUrl;
    if (def.requiresCustomUrl && !baseUrl) {
      setError('Vui lòng nhập Base URL trước khi discover');
      return;
    }

    // Need at least one API key to discover
    const activeKey = formData.apiKeys.find(k => k.isActive && k.key);
    if (!activeKey) {
      setError('Vui lòng thêm ít nhất 1 API Key active trước khi discover');
      return;
    }

    setIsDiscoveringInline(true);
    setError(null);
    try {
      // Use the new inline discover API
      const result = await Database.discoverModelsInline({
        providerId: formData.providerId,
        baseUrl: baseUrl,
        apiKey: activeKey.key,
        apiKeys: formData.apiKeys.filter(k => k.isActive && k.key).map(k => ({
          key: k.key,
          label: k.label,
          priority: k.priority,
        })),
        name: formData.name || def.name,
        customHeaders: formData.customHeaders,
      });

      if (result.models && result.models.length > 0) {
        setDiscoveredModels(result.models);
        setLastDiscoveredProviderId(formData.providerId);
        setSuccess(`Đã discover ${result.models.length} models từ ${def.name}`);
      } else {
        setError(result.error || 'Không tìm thấy model nào');
        setDiscoveredModels([]);
      }
    } catch (err: any) {
      setError(err.message || 'Discover failed');
      setDiscoveredModels([]);
    } finally {
      setIsDiscoveringInline(false);
    }
  };

  // Auto-discover when provider changes (for known providers)
  useEffect(() => {
    const def = definitions.find(d => d.id === formData.providerId);
    if (def && !def.requiresCustomUrl && def.baseUrl) {
      // Auto-discover for known providers after a short delay
      const timer = setTimeout(() => {
        handleDiscoverInline();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData.providerId]);

  const handleApiKeyChange = (index: number, field: string, value: any) => {
    const newKeys = [...formData.apiKeys];
    newKeys[index] = { ...newKeys[index], [field]: value };
    setFormData(prev => ({ ...prev, apiKeys: newKeys }));
  };

  const addApiKey = () => {
    setFormData(prev => ({
      ...prev,
      apiKeys: [...prev.apiKeys, { key: '', label: `Key ${prev.apiKeys.length + 1}`, isActive: true, priority: prev.apiKeys.length + 1 }],
    }));
  };

  const removeApiKey = (index: number) => {
    setFormData(prev => ({
      ...prev,
      apiKeys: prev.apiKeys.filter((_, i) => i !== index),
    }));
  };

  const handleSubmitProvider = async () => {
    if (!formData.providerId) {
      setError('Vui lòng chọn loại provider');
      return;
    }

    const def = definitions.find(d => d.id === formData.providerId);
    if (def?.requiresCustomUrl && !formData.baseUrl) {
      setError('Base URL là bắt buộc cho provider tùy chỉnh');
      return;
    }

    if (formData.apiKeys.length === 0) {
      setError('Vui lòng thêm ít nhất 1 API Key');
      return;
    }

    for (const k of formData.apiKeys) {
      if (!k.key && (!k._id || activeTab === 'add')) {
        setError('Vui lòng nhập đầy đủ API Key');
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    try {
      // Prepare data for submission - remove empty keys in edit mode (keep existing)
      const submitData = {
        ...formData,
        customHeaders: formData.customHeaders.map(h => ({ ...h, value: h.isSecret && h.value === '' ? undefined : h.value })),
        apiKeys: formData.apiKeys
          .filter(k => k.key || (k._id && activeTab === 'edit')) // Keep existing keys in edit mode even if empty
          .map(k => ({
            ...k,
            _id: undefined, // Don't send _id for keys, let backend handle
          })),
      };

      if (activeTab === 'edit' && formData._id) {
        // Edit mode
        await Database.updateAIProvider(formData._id, submitData);
        setSuccess('Đã cập nhật provider thành công!');
      } else {
        // Add mode
        await Database.createAIProvider(submitData);
        setSuccess('Đã tạo provider thành công!');
      }
      resetForm();
      fetchData();
      setActiveTab('list');
    } catch (err: any) {
      setError(err.message || (activeTab === 'edit' ? 'Failed to update provider' : 'Failed to create provider'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleProvider = async (provider: AIProvider) => {
    setIsLoading(true);
    setError(null);
    try {
      await Database.updateAIProvider(provider._id, { isEnabled: !provider.isEnabled });
      setSuccess(provider.isEnabled ? 'Đã tắt provider' : 'Đã bật provider');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle provider');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa provider này?')) return;
    setIsLoading(true);
    try {
      await Database.deleteAIProvider(id);
      setSuccess('Đã xóa provider!');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete provider');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async (provider: AIProvider) => {
    setIsTesting(true);
    setTestingProviderId(provider._id);
    setTestResult(null);
    setError(null);
    try {
      const result = await Database.testAIProvider(provider._id);
      setTestResult({
        ...result,
        providerName: provider.name,
        timestamp: new Date().toISOString(),
      });
      setSuccess(`Test thành công: ${result.durationMs}ms`);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message,
        providerName: provider.name,
        timestamp: new Date().toISOString(),
      });
      setError(err.message || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const getDef = (providerId: string) => definitions.find(d => d.id === providerId);

  const clearMessages = () => { setError(null); setSuccess(null); };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">🤖 AI Providers</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setActiveTab('list'); clearMessages(); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold uppercase ${activeTab === 'list' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            📋 Danh sách
          </button>
          <button
            onClick={() => { resetForm(); setActiveTab('add'); clearMessages(); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold uppercase ${activeTab === 'add' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            ➕ Thêm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4">
          <p className="text-rose-700 font-medium">❌ {error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
          <p className="text-emerald-700 font-medium">✅ {success}</p>
        </div>
      )}

      {/* Tab: List Providers */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Đang tải...</div>
          ) : providers.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center">
              <p className="text-slate-400 font-medium">Chưa có provider nào</p>
              <p className="text-sm text-slate-500 mt-1">Nhấn "Thêm mới" để cấu hình provider đầu tiên</p>
            </div>
          ) : (
            <div className="space-y-4">
              {providers.map(provider => {
                const def = getDef(provider.providerId);
                return (
                  <div key={provider._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:border-emerald-200 transition-all">
                    {/* Provider Header */}
                    <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{def ? '🤖' : '⚙️'}</span>
                        <div>
                          <div className="font-black text-slate-800">{provider.name}</div>
                          <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{provider.providerId}</div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${provider.isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {provider.isEnabled ? '🟢 Đang bật' : '🔴 Đang tắt'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleEditProvider(provider)}
                          className="px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-50 transition"
                        >
                          ✏️ Sửa
                        </button>
                        <button
                          onClick={() => handleTestConnection(provider)}
                          disabled={isLoading || isTesting}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition disabled:opacity-50"
                        >
                          🧪 Test
                        </button>
                        <button
                          onClick={() => handleToggleProvider(provider)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
                        >
                          {provider.isEnabled ? 'Tắt' : 'Bật'}
                        </button>
                        <button
                          onClick={() => handleDeleteProvider(provider._id)}
                          className="px-3 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
                        >
                          🗑️ Xóa
                        </button>
                      </div>
                    </div>

                    {/* Provider Details */}
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400 font-medium uppercase tracking-wide">Base URL</p>
                          <p className="font-mono text-slate-700 truncate">{provider.baseUrl || def?.baseUrl || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium uppercase tracking-wide">Strategy</p>
                          <p className="font-bold text-slate-700 capitalize">{provider.strategy}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium uppercase tracking-wide">Timeout</p>
                          <p className="font-bold text-slate-700">{(provider.defaultTimeoutMs / 1000).toFixed(0)}s</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium uppercase tracking-wide">Retries</p>
                          <p className="font-bold text-slate-700">{provider.defaultRetries}</p>
                        </div>
                      </div>

                      {/* API Keys */}
                      <div className="pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-black text-slate-600 text-sm uppercase tracking-wide">API Keys ({provider.activeKeysCount}/{provider.apiKeys.length} active)</p>
                        </div>
                        {provider.apiKeys.length === 0 ? (
                          <p className="text-sm text-slate-400">Chưa có API Key</p>
                        ) : (
                          <div className="space-y-2">
                            {provider.apiKeys.map((key, i) => (
                              <div key={key._id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <span className="w-6 text-center text-slate-400 font-bold">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-slate-800">{key.label}</p>
                                  <p className="text-xs font-mono text-slate-400 truncate">{key.maskedKey}</p>
                                </div>
                                <span className={`w-2 h-2 rounded-full ${key.isActive ? (key.cooldownUntil && new Date(key.cooldownUntil) > new Date() ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500') : 'bg-slate-300'}`}></span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${key.isActive ? (key.cooldownUntil && new Date(key.cooldownUntil) > new Date() ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700') : 'bg-slate-100 text-slate-500'}`}>
                                  {key.isActive ? (key.cooldownUntil && new Date(key.cooldownUntil) > new Date() ? '⏳ Cooldown' : '🟢 Active') : '🔴 Inactive'}
                                </span>
                                {key.failCount > 0 && (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700">Lỗi: {key.failCount}</span>
                                )}
                                <span className="text-[9px] text-slate-400">Priority: {key.priority}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Selected Models */}
                      <div className="pt-4 border-t border-slate-100">
                        <p className="font-black text-slate-600 text-sm uppercase tracking-wide mb-2">Selected Models ({provider.selectedModelIds.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {provider.selectedModelIds.length === 0 ? (
                            <span className="text-sm text-slate-400">Chưa chọn model</span>
                          ) : (
                            provider.selectedModelIds.map((modelId, i) => (
                              <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium border border-emerald-100">
                                {def?.freeModels.includes(modelId) ? '🆓 ' : ''}{modelId}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Test Result Modal */}
      {testResult && testingProviderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-black text-slate-800 flex items-center gap-2">
                <span className="text-lg">{testResult.success ? '✅' : '❌'}</span> Kết quả Test: {testResult.providerName}
              </h4>
              <button
                onClick={() => { setTestResult(null); setTestingProviderId(null); }}
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 font-medium uppercase tracking-wide">Trạng thái</p>
                  <p className={`font-bold ${testResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {testResult.success ? 'Thành công' : 'Thất bại'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium uppercase tracking-wide">Latency</p>
                  <p className="font-bold text-slate-700">{testResult.durationMs}ms</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium uppercase tracking-wide">Model được gọi</p>
                  <p className="font-bold text-slate-700">{testResult.modelUsed || testResult.resolvedModel || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium uppercase tracking-wide">Tokens</p>
                  <p className="font-bold text-slate-700">{testResult.usage?.total_tokens || '—'}</p>
                </div>
                {testResult.cost !== undefined && (
                  <div>
                    <p className="text-slate-400 font-medium uppercase tracking-wide">Chi phí</p>
                    <p className="font-bold text-slate-700">${testResult.cost.toFixed(6)}</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-400 font-medium uppercase tracking-wide">Thời gian</p>
                  <p className="font-bold text-slate-700">{new Date(testResult.timestamp).toLocaleString('vi-VN')}</p>
                </div>
              </div>

              {testResult.text && (
                <div className="pt-4 border-t border-slate-100">
                  <p className="font-black text-slate-600 text-sm uppercase tracking-wide mb-2">Phản hồi AI</p>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {testResult.text}
                  </div>
                </div>
              )}

              {testResult.error && (
                <div className="pt-4 border-t border-rose-100 bg-rose-50 p-4 rounded-xl border border-rose-100">
                  <p className="font-black text-rose-700 text-sm uppercase tracking-wide mb-2">Lỗi chi tiết</p>
                  <pre className="text-xs font-mono text-rose-600 whitespace-pre-wrap">{testResult.error}</pre>
                </div>
              )}

              {testResult.usage && (
                <div className="pt-4 border-t border-slate-100">
                  <p className="font-black text-slate-600 text-sm uppercase tracking-wide mb-2">Token Usage Chi tiết</p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="bg-emerald-50 p-3 rounded-xl text-center">
                      <p className="text-emerald-700 font-bold">{testResult.usage.prompt_tokens || 0}</p>
                      <p className="text-emerald-500 text-[10px] uppercase">Prompt Tokens</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-xl text-center">
                      <p className="text-blue-700 font-bold">{testResult.usage.completion_tokens || 0}</p>
                      <p className="text-blue-500 text-[10px] uppercase">Completion Tokens</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-xl text-center">
                      <p className="text-purple-700 font-bold">{testResult.usage.total_tokens || 0}</p>
                      <p className="text-purple-500 text-[10px] uppercase">Total Tokens</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => { setTestResult(null); setTestingProviderId(null); }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Add/Edit Provider */}
      {(activeTab === 'add' || activeTab === 'edit') && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
            <h4 className="font-black text-emerald-700 uppercase tracking-widest text-sm flex items-center gap-2">
              <span className="text-lg">{activeTab === 'edit' ? '✏️' : '➕'}</span> {activeTab === 'edit' ? 'Chỉnh sửa provider' : 'Thêm provider mới'}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Loại Provider</label>
                <div className="relative">
                  <select
                    value={formData.providerId}
                    onChange={e => {
                      if (activeTab === 'edit') return; // Don't allow changing providerId in edit mode
                      const def = definitions.find(d => d.id === e.target.value);
                      handleFormChange('providerId', e.target.value);
                      if (def) {
                        handleFormChange('name', def.name);
                        handleFormChange('baseUrl', def.baseUrl);
                        handleFormChange('defaultTimeoutMs', def.defaultTimeoutMs);
                        handleFormChange('defaultRetries', def.defaultRetries);
                        // Clear discovered models when provider changes
                        setDiscoveredModels([]);
                        setLastDiscoveredProviderId(null);
                      }
                    }}
                    disabled={activeTab === 'edit'}
                    className={`w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-black appearance-none cursor-pointer pr-12 ${activeTab === 'edit' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                  >
                    {definitions.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  {activeTab === 'edit' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-200 text-slate-500 rounded-lg font-black uppercase text-[9px]">
                      Không đổi
                    </span>
                  )}
                  {/* Discover button for known providers */}
                  {definitions.find(d => d.id === formData.providerId) && !definitions.find(d => d.id === formData.providerId)?.requiresCustomUrl && (
                    <button
                      type="button"
                      onClick={handleDiscoverInline}
                      disabled={isDiscoveringInline || !formData.apiKeys.some(k => k.isActive && k.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-purple-600 text-white rounded-lg font-black uppercase text-[9px] shadow disabled:opacity-50 hover:bg-purple-500 whitespace-nowrap"
                    >
                      {isDiscoveringInline ? '⏳...' : '🔍 Discover'}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Tên hiển thị</label>
                <input
                  value={formData.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  placeholder="Google Gemini"
                  className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                />
              </div>
            </div>

            {['selfhosted', 'custom'].includes(formData.providerId) && (
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Base URL <span className="text-rose-500">*</span></label>
                <div className="flex gap-2">
                  <input
                    value={formData.baseUrl}
                    onChange={e => handleFormChange('baseUrl', e.target.value)}
                    placeholder="http://mc.luckyhub.io.vn:20128/v1"
                    className="flex-1 px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleDiscoverInline}
                    disabled={isDiscoveringInline || !formData.baseUrl || !formData.apiKeys.some(k => k.isActive && k.key)}
                    className="px-4 py-3 bg-purple-600 text-white rounded-xl font-black uppercase text-xs shadow disabled:opacity-50 hover:bg-purple-500 whitespace-nowrap"
                  >
                    {isDiscoveringInline ? '⏳ Discover...' : '🔍 Discover Models'}
                  </button>
                </div>
              </div>
            )}

            {/* Model Selection - shows after discover */}
            {discoveredModels.length > 0 && lastDiscoveredProviderId === formData.providerId && (
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="font-black text-purple-700 uppercase tracking-widest text-sm flex items-center gap-2">
                    <span className="text-lg">📋</span> Models Discovered ({discoveredModels.length})
                  </h5>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">
                    Chọn model cho provider này
                  </span>
                </div>
                <MultiSelectDropdown
                  options={discoveredModels}
                  selectedValues={formData.selectedModelIds}
                  onChange={(values) => handleFormChange('selectedModelIds', values)}
                  placeholder="-- Chọn model --"
                  maxDisplay={3}
                />
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleFormChange('selectedModelIds', discoveredModels.map((m: any) => m.modelId))}
                    className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200"
                  >
                    ✅ Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormChange('selectedModelIds', [])}
                    className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200"
                  >
                    ❌ Bỏ chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscoverInline}
                    disabled={isDiscoveringInline}
                    className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-200"
                  >
                    🔄 Discover lại
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Strategy</label>
                <select
                  value={formData.strategy}
                  onChange={e => handleFormChange('strategy', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-black appearance-none cursor-pointer"
                >
                  <option value="fallback">Fallback (thử lần lượt)</option>
                  <option value="round-robin">Round-robin (xen kẽ)</option>
                  <option value="priority">Priority (ưu tiên cao nhất)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Timeout (ms)</label>
                <input
                  type="number" inputMode="numeric"
                  value={formData.defaultTimeoutMs}
                  onChange={e => handleFormChange('defaultTimeoutMs', parseInt(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Retries</label>
              <input
                type="number" inputMode="numeric"
                value={formData.defaultRetries}
                onChange={e => handleFormChange('defaultRetries', parseInt(e.target.value))}
                className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>

            {/* API Keys Section */}
            <div className="pt-4 border-t border-emerald-200">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-black text-slate-700 uppercase tracking-wide text-sm">API Keys</h5>
                <button onClick={addApiKey} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200">➕ Thêm Key</button>
              </div>
              {formData.apiKeys.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Chưa có API Key. Nhấn "Thêm Key" để bắt đầu.</p>
              ) : (
                <div className="space-y-3">
                  {formData.apiKeys.map((key, i) => (
                    <div key={key._id || i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-white rounded-xl border border-slate-100">
                      {activeTab === 'edit' && key._id && key.key === '' ? (
                        // In edit mode, show masked key for existing keys
                        <>
                          <div className="sm:col-span-2 flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span className="text-sm font-mono text-slate-400">{key.maskedKey || '••••••••••••'}</span>
                            <span className="text-xs text-slate-500">(giữ nguyên key hiện tại)</span>
                          </div>
                          <input
                            type="hidden"
                            value={key.key}
                            onChange={e => handleApiKeyChange(i, 'key', e.target.value)}
                          />
                        </>
                      ) : (
                        // New key or edit mode with new key input
                        <input
                          type="password"
                          placeholder={activeTab === 'edit' && key._id ? 'Nhập key mới để thay đổi' : 'API Key'}
                          value={key.key}
                          onChange={e => handleApiKeyChange(i, 'key', e.target.value)}
                          className="sm:col-span-2 px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      )}
                      <input
                        placeholder="Label"
                        value={key.label}
                        onChange={e => handleApiKeyChange(i, 'label', e.target.value)}
                        className="px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number" inputMode="numeric"
                          value={key.priority}
                          onChange={e => handleApiKeyChange(i, 'priority', parseInt(e.target.value))}
                          className="w-16 px-3 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-center"
                          min="1"
                        />
                        <button onClick={() => removeApiKey(i)} className="p-2 text-rose-400 hover:text-rose-600">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSubmitProvider}
                disabled={isLoading}
                className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-sm shadow-lg disabled:opacity-50"
              >
                {isLoading ? '⏳ Đang lưu...' : activeTab === 'edit' ? '✅ CẬP NHẬT PROVIDER' : '✅ TẠO PROVIDER'}
              </button>
              <button
                onClick={() => { setActiveTab('list'); clearMessages(); }}
                className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-sm hover:bg-slate-200"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

AIProviderPanel.displayName = 'AIProviderPanel';
export default AIProviderPanel;