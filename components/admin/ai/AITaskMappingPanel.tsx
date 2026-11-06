import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Database } from '../../../services/database.ts';

type AITaskType = 'chat' | 'coach' | 'vision' | 'verify' | 'food' | 'meal-plan' | 'embedding';

interface AIProvider {
  _id: string;
  providerId: string;
  name: string;
  isEnabled: boolean;
  selectedModelIds: string[];
  baseUrl?: string;
  customHeaders?: Array<{ key: string; value: string; isSecret: boolean }>;
  apiKeys?: Array<{
    _id: string;
    label: string;
    isActive: boolean;
    priority: number;
    maskedKey?: string;
  }>;
}

interface AIModel {
  _id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  capabilities: {
    chat: boolean;
    vision: boolean;
    functionCalling: boolean;
    jsonMode: boolean;
    maxContext: number;
    maxOutput: number;
  };
  isFreeTier: boolean;
  isActive: boolean;
}

interface TaskConfig {
  _id: string;
  taskType: AITaskType;
  providerPriority: Array<{
    providerId: string;
    enabled: boolean;
    strategy: 'round-robin' | 'fallback' | 'priority';
    weight: number;
  }>;
  modelPriority: Array<{
    providerId: string;
    modelId: string;
    enabled: boolean;
    apiKeyIndex: number;
    weight: number;
  }>;
  globalFallbackEnabled: boolean;
  defaultProviderStrategy: 'round-robin' | 'fallback' | 'priority';
  updatedBy: string;
  updatedAt: string;
}

interface AvailableModel {
  provider: string;
  models: Array<{
    modelId: string;
    displayName: string;
    isFreeTier: boolean;
    capabilities: any;
    keyLabel: string;
    keyPriority: number;
  }>;
}

const TASK_LABELS: Record<AITaskType, string> = {
  chat: 'Chat',
  coach: 'AI Coach',
  vision: 'Vision Analysis',
  verify: 'Avatar Verification',
  food: 'Food Analysis',
  'meal-plan': 'Meal Planning',
  embedding: 'Embedding',
};

/** Task bắt buộc model có khả năng đọc ảnh */
const VISION_TASKS: AITaskType[] = ['vision', 'verify', 'food'];

/** Provider có thể trả về hàng trăm model — chỉ render tối đa ngần này, phần còn lại lọc bằng ô tìm kiếm */
const MODEL_RENDER_LIMIT = 80;

const TASK_ICONS: Record<AITaskType, string> = {
  chat: '💬',
  coach: '🏋️',
  vision: '👁️',
  verify: '🔍',
  food: '🍽️',
  'meal-plan': '📅',
  embedding: '🔢',
};

const AITaskMappingPanel: React.FC = memo(() => {
  const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [availableModels, setAvailableModels] = useState<Record<AITaskType, AvailableModel[]>>({} as any);
  const [taskProviderModels, setTaskProviderModels] = useState<Record<string, AIModel[]>>({});
  const [loadingTaskModels, setLoadingTaskModels] = useState<Record<string, boolean>>({});
  const [taskModelFilters, setTaskModelFilters] = useState<Record<string, string>>({});
  const [activeTask, setActiveTask] = useState<AITaskType>('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Test section state - NEW DESIGN: Single provider, single model, output textbox
  const [selectedTestProvider, setSelectedTestProvider] = useState<string>('');
  const [selectedTestModel, setSelectedTestModel] = useState<string>('');
  const [discoveredModels, setDiscoveredModels] = useState<Array<{
    modelId: string;
    displayName: string;
    isFreeTier: boolean;
    capabilities: any;
  }>>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelFilter, setModelFilter] = useState('');
  const [testPrompt, setTestPrompt] = useState('');
  const [testImageBase64, setTestImageBase64] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<string>('');
  const [testUsage, setTestUsage] = useState<{prompt_tokens?: number; completion_tokens?: number; total_tokens?: number} | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configs, provs] = await Promise.all([
        Database.getAITaskConfigs(),
        Database.getAIProviders(),
      ]);
      setTaskConfigs(configs);
      setProviders(provs.filter(p => p.isEnabled));

      // Fetch available models for each task type
      const taskTypes: AITaskType[] = ['chat', 'coach', 'vision', 'verify', 'food', 'meal-plan', 'embedding'];
      const modelsData: Record<AITaskType, AvailableModel[]> = {} as any;
      for (const t of taskTypes) {
        modelsData[t] = await Database.getAvailableModelsForTask(t);
      }
      setAvailableModels(modelsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load task configs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getConfig = (taskType: AITaskType) => taskConfigs.find(c => c.taskType === taskType);

  const getProviderName = (providerId: string) => {
    const p = providers.find(p => p._id === providerId);
    return p ? `${p.name} (${p.providerId})` : 'Unknown';
  };

  const getModelInfo = (taskType: AITaskType, providerId: string, modelId: string) => {
    const provider = providers.find(p => p._id === providerId);
    const cachedModel = taskProviderModels[`${taskType}:${providerId}`]?.find(m => m.modelId === modelId);
    if (cachedModel) return cachedModel;

    const avail = availableModels[taskType];
    if (!avail) return null;
    const providerLabel = provider ? `${provider.name} (${provider.providerId})` : '';
    return avail.find(a => a.provider === providerLabel)?.models.find(m => m.modelId === modelId) || null;
  };

  const handleProviderReorder = (taskType: AITaskType, fromIndex: number, toIndex: number) => {
    const config = getConfig(taskType);
    if (!config) return;
    const newPriority = [...config.providerPriority];
    const [removed] = newPriority.splice(fromIndex, 1);
    newPriority.splice(toIndex, 0, removed);
    updateConfig(taskType, { providerPriority: newPriority });
  };

  const handleModelReorder = (taskType: AITaskType, providerId: string, fromIndex: number, toIndex: number) => {
    const config = getConfig(taskType);
    if (!config) return;
    const providerModels = config.modelPriority.filter(m => m.providerId === providerId);
    const otherModels = config.modelPriority.filter(m => m.providerId !== providerId);
    const [removed] = providerModels.splice(fromIndex, 1);
    providerModels.splice(toIndex, 0, removed);
    updateConfig(taskType, { modelPriority: [...providerModels, ...otherModels] });
  };

  const updateConfig = async (taskType: AITaskType, updates: Partial<TaskConfig>) => {
    setIsSaving(true);
    setError(null);
    try {
      await Database.updateAITaskConfig(taskType, updates);
      setSuccess('Đã lưu cấu hình!');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddProvider = async (taskType: AITaskType, providerId: string) => {
    const config = getConfig(taskType);
    if (!config) return;
    if (config.providerPriority.some(p => p.providerId === providerId)) return;

    try {
      await loadTaskProviderModels(providerId, taskType, true);
    } catch (err: any) {
      setError(err.message || 'Không tải được danh sách model của provider');
      return;
    }

    await updateConfig(taskType, {
      providerPriority: [...config.providerPriority, { providerId, enabled: true, strategy: 'fallback', weight: 1 }],
    });
  };

  const handleRemoveProvider = async (taskType: AITaskType, providerId: string) => {
    const config = getConfig(taskType);
    if (!config) return;

    await updateConfig(taskType, {
      providerPriority: config.providerPriority.filter(p => p.providerId !== providerId),
      modelPriority: config.modelPriority.filter(m => m.providerId !== providerId),
    });
  };

  const handleAddModel = async (taskType: AITaskType, providerId: string, modelId: string) => {
    const config = getConfig(taskType);
    if (!config) return;
    if (config.modelPriority.some(m => m.providerId === providerId && m.modelId === modelId)) return;

    await updateConfig(taskType, {
      modelPriority: [...config.modelPriority, { providerId, modelId, enabled: true, apiKeyIndex: -1, weight: 1 }],
    });
  };

  const handleRemoveModel = async (taskType: AITaskType, providerId: string, modelId: string) => {
    const config = getConfig(taskType);
    if (!config) return;

    await updateConfig(taskType, {
      modelPriority: config.modelPriority.filter(m => !(m.providerId === providerId && m.modelId === modelId)),
    });
  };

  const handleToggleProvider = async (taskType: AITaskType, providerId: string, enabled: boolean) => {
    const config = getConfig(taskType);
    if (!config) return;

    await updateConfig(taskType, {
      providerPriority: config.providerPriority.map(p =>
        p.providerId === providerId ? { ...p, enabled } : p
      ),
    });
  };

  const handleToggleModel = async (taskType: AITaskType, providerId: string, modelId: string, enabled: boolean) => {
    const config = getConfig(taskType);
    if (!config) return;

    await updateConfig(taskType, {
      modelPriority: config.modelPriority.map(m =>
        m.providerId === providerId && m.modelId === modelId ? { ...m, enabled } : m
      ),
    });
  };

  const handleStrategyChange = async (taskType: AITaskType, providerId: string, strategy: 'round-robin' | 'fallback' | 'priority') => {
    const config = getConfig(taskType);
    if (!config) return;

    await updateConfig(taskType, {
      providerPriority: config.providerPriority.map(p =>
        p.providerId === providerId ? { ...p, strategy } : p
      ),
    });
  };

  const handleGlobalFallbackChange = async (taskType: AITaskType, enabled: boolean) => {
    const config = getConfig(taskType);
    if (!config) return;

    await updateConfig(taskType, { globalFallbackEnabled: enabled });
  };

  const handleDefaultStrategyChange = async (taskType: AITaskType, strategy: 'round-robin' | 'fallback' | 'priority') => {
    const config = getConfig(taskType);
    if (!config) return;

    await updateConfig(taskType, { defaultProviderStrategy: strategy });
  };

  const clearMessages = () => { setError(null); setSuccess(null); };

  // Test section handlers
  const testAuthHeaders = () => ({
    'Content-Type': 'application/json',
  });

  const loadTaskProviderModels = useCallback(async (
    providerId: string,
    taskType: AITaskType,
    discoverIfEmpty = false
  ): Promise<AIModel[]> => {
    const cacheKey = `${taskType}:${providerId}`;
    setLoadingTaskModels(prev => ({ ...prev, [cacheKey]: true }));

    try {
      const fetchCachedModels = async (): Promise<AIModel[]> => {
        const response = await fetch(
          `/api/admin/ai/providers/${providerId}/models?taskType=${encodeURIComponent(taskType)}`,
          { headers: testAuthHeaders() }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || `Không tải được danh sách model (${response.status})`);
        }
        return Array.isArray(data.models) ? data.models : [];
      };

      let models = await fetchCachedModels();
      if (models.length === 0 && discoverIfEmpty) {
        const response = await fetch(`/api/admin/ai/providers/${providerId}/discover`, {
          method: 'POST',
          headers: testAuthHeaders(),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || data.error || `Không cập nhật được model (${response.status})`);
        }
        if (data.error) throw new Error(data.error);
        models = await fetchCachedModels();
      }

      setTaskProviderModels(prev => ({ ...prev, [cacheKey]: models }));
      return models;
    } finally {
      setLoadingTaskModels(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, []);

  useEffect(() => {
    const config = taskConfigs.find(c => c.taskType === activeTask);
    const providersToLoad = config?.providerPriority || [];
    providersToLoad.forEach(({ providerId }) => {
      const cacheKey = `${activeTask}:${providerId}`;
      if (taskProviderModels[cacheKey] !== undefined || loadingTaskModels[cacheKey]) return;
      loadTaskProviderModels(providerId, activeTask).catch((err: any) => {
        console.error('[AITaskMapping] Load task models failed:', err);
        setError(err.message || 'Không tải được danh sách model của task');
        setTaskProviderModels(prev => ({ ...prev, [cacheKey]: [] }));
      });
    });
  }, [activeTask, taskConfigs, taskProviderModels, loadingTaskModels, loadTaskProviderModels]);

  /**
   * Nạp danh sách model đã phát hiện của provider (đọc từ cache trong DB) để admin
   * chọn được model TRƯỚC khi nhập prompt. Trả về danh sách vừa nạp.
   */
  const loadProviderModels = useCallback(async (
    providerId: string,
    taskType: AITaskType,
    options: { silent?: boolean } = {}
  ): Promise<Array<{ modelId: string }>> => {
    if (!providerId) return [];
    setIsLoadingModels(true);
    if (!options.silent) setError(null);

    try {
      const response = await fetch(
        `/api/admin/ai/providers/${providerId}/models?taskType=${encodeURIComponent(taskType)}`,
        { headers: testAuthHeaders() }
      );
      const data = await response.json();
      const models: Array<{ modelId: string }> = data.models || [];

      setDiscoveredModels(models as any);
      setSelectedTestModel(prev =>
        prev && models.some(m => m.modelId === prev) ? prev : (models[0]?.modelId || '')
      );
      return models;
    } catch (err: any) {
      console.error('[AITaskMapping] Load provider models failed:', err);
      if (!options.silent) setError(err.message || 'Không tải được danh sách model');
      return [];
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  /** Gọi provider để phát hiện lại model rồi nạp lại cache */
  const refreshModelsFromProvider = useCallback(async (providerId: string) => {
    const provider = providers.find(p => p._id === providerId);
    if (!provider) {
      setError('Không tìm thấy provider');
      return;
    }

    setIsLoadingModels(true);
    setError(null);
    setSuccess(null);

    try {
      // Discover qua provider đã lưu để server dùng key đã mã hoá trong DB
      const response = await fetch(`/api/admin/ai/providers/${providerId}/discover`, {
        method: 'POST',
        headers: testAuthHeaders(),
      });
      const data = await response.json();
      const models: Array<{ modelId: string }> = data.models || [];

      if (models.length === 0) {
        setError(data.error || `Provider ${provider.name} không trả về model nào`);
      } else {
        setSuccess(`Đã cập nhật ${models.length} model từ ${provider.name}`);
      }
      await loadProviderModels(providerId, activeTask, { silent: true });
    } catch (err: any) {
      console.error('[AITaskMapping] Refresh models failed:', err);
      setError(err.message || 'Cập nhật model thất bại');
    } finally {
      setIsLoadingModels(false);
    }
  }, [providers, activeTask, loadProviderModels]);

  const handleTestProviderSelect = async (providerId: string) => {
    setSelectedTestProvider(providerId);
    setSelectedTestModel('');
    setDiscoveredModels([]);
    setModelFilter('');
    setTestOutput('');
    setTestUsage(null);
    clearMessages();

    const models = await loadProviderModels(providerId, activeTask);
    // Cache rỗng (provider mới thêm hoặc chưa discover lần nào) -> tự đi lấy từ provider
    if (models.length === 0) {
      await refreshModelsFromProvider(providerId);
    }
  };

  /** Đổi task -> nạp lại model đúng bộ lọc của task (vision/verify/food chỉ lấy model có vision) */
  const handleTaskChange = (taskType: AITaskType) => {
    setActiveTask(taskType);
    clearMessages();
    if (selectedTestProvider) {
      loadProviderModels(selectedTestProvider, taskType, { silent: true });
    }
  };

  const handleTestPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTestPrompt(e.target.value);
  };

  const handleTestImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setTestImageBase64(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearTestImage = () => {
    setTestImageBase64(null);
  };

  const runSingleModelTest = async () => {
    if (!selectedTestProvider || !selectedTestModel) {
      setError('Vui lòng chọn provider và model');
      return;
    }
    if (!testPrompt.trim() && !testImageBase64) {
      setError('Vui lòng nhập prompt hoặc chọn ảnh');
      return;
    }

    setIsTesting(true);
    setTestOutput('');
    setTestUsage(null);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/ai/test-custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskType: activeTask,
          prompt: testPrompt,
          imageBase64: testImageBase64,
          providerId: selectedTestProvider,
          modelId: selectedTestModel
        })
      });

      const data = await response.json();

      if (data.success) {
        setTestOutput(data.text || 'Không có phản hồi');
        setTestUsage(data.usage || null);
        setSuccess(`Test thành công: ${data.durationMs}ms`);
      } else {
        setTestOutput(`LỖI: ${data.error || 'Unknown error'}`);
        setTestUsage(null);
        setError(data.error || 'Test thất bại');
      }
    } catch (err: any) {
      setTestOutput(`LỖI: ${err.message}`);
      setTestUsage(null);
      setError(err.message || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const taskTypes: AITaskType[] = ['chat', 'coach', 'vision', 'verify', 'food', 'meal-plan', 'embedding'];

  // Model đang hiện trong ô chọn: lọc theo từ khoá, model có vision xếp trước
  const filteredModels = useMemo(() => {
    const keyword = modelFilter.trim().toLowerCase();
    const list = keyword
      ? discoveredModels.filter(m =>
          m.modelId.toLowerCase().includes(keyword) ||
          (m.displayName || '').toLowerCase().includes(keyword)
        )
      : discoveredModels;

    return [...list].sort(
      (a, b) => Number(!!b.capabilities?.vision) - Number(!!a.capabilities?.vision)
    );
  }, [discoveredModels, modelFilter]);

  const visibleModels = filteredModels.slice(0, MODEL_RENDER_LIMIT);
  const hiddenModelCount = filteredModels.length - visibleModels.length;
  const isVisionTask = VISION_TASKS.includes(activeTask);
  const selectedModelInfo = discoveredModels.find(m => m.modelId === selectedTestModel);

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400">Đang tải...</div>;
  }

  const config = getConfig(activeTask);

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">📋 Task Mapping</h3>
        <div className="flex flex-wrap gap-2">
          {taskTypes.map(t => (
            <button
              key={t}
              onClick={() => handleTaskChange(t)}
              className={`px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                activeTask === t
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {TASK_ICONS[t]} {TASK_LABELS[t]}
            </button>
          ))}
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

      {!config && (
        <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center">
          <p className="text-slate-400 font-medium">Chưa có cấu hình cho task này</p>
          <p className="text-sm text-slate-500 mt-1">Sẽ được tạo tự động khi lưu</p>
        </div>
      )}

      {config && (
        <div className="space-y-6">
          {/* Global Settings */}
          <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
            <h4 className="font-black text-slate-700 uppercase tracking-widest text-sm flex items-center gap-2">
              <span className="text-lg">⚙️</span> Cài đặt chung
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.globalFallbackEnabled}
                  onChange={e => handleGlobalFallbackChange(activeTask, e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-slate-700">Global Fallback (thử provider khác khi hết provider trong danh sách)</span>
              </label>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Default Provider Strategy</label>
                <select
                  value={config.defaultProviderStrategy}
                  onChange={e => handleDefaultStrategyChange(activeTask, e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="fallback">Fallback</option>
                  <option value="round-robin">Round-robin</option>
                  <option value="priority">Priority</option>
                </select>
              </div>
            </div>
          </div>

          {/* Provider Priority */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h4 className="font-black text-slate-700 uppercase tracking-widest text-sm flex items-center gap-2">
                <span className="text-lg">🎯</span> Provider Priority (Kéo thả để sắp xếp)
              </h4>
              <div className="flex flex-wrap gap-2">
                {providers.filter(p => !config.providerPriority.some(cp => cp.providerId === p._id)).map(p => (
                  <button
                    key={p._id}
                    onClick={() => handleAddProvider(activeTask, p._id)}
                    className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200"
                  >
                    ➕ {p.name}
                  </button>
                ))}
              </div>
            </div>

            {config.providerPriority.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="font-medium">Chưa có provider nào</p>
                <p className="text-sm mt-1">Nhấn nút ➕ để thêm provider vào danh sách ưu tiên</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {config.providerPriority.map((pp, idx) => {
                  const provider = providers.find(p => p._id === pp.providerId);
                  if (!provider) return null;
                  const providerModels = config.modelPriority.filter(m => m.providerId === pp.providerId);
                  const providerModelCacheKey = `${activeTask}:${pp.providerId}`;
                  const providerAvailableModels = taskProviderModels[providerModelCacheKey] || [];
                  const modelsToAdd = providerAvailableModels.filter(
                    model => !config.modelPriority.some(pm => pm.providerId === pp.providerId && pm.modelId === model.modelId)
                  );
                  const modelSearch = (taskModelFilters[providerModelCacheKey] || '').trim().toLowerCase();
                  const filteredTaskModels = modelsToAdd.filter(model =>
                    `${model.displayName || ''} ${model.modelId}`.toLowerCase().includes(modelSearch)
                  );

                  return (
                    <div key={pp.providerId} className="p-4 hover:bg-slate-50/50 transition">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                        <button
                          onClick={() => idx > 0 && handleProviderReorder(activeTask, idx, idx - 1)}
                          disabled={idx === 0}
                          className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => idx < config.providerPriority.length - 1 && handleProviderReorder(activeTask, idx, idx + 1)}
                          disabled={idx === config.providerPriority.length - 1}
                          className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <span className="w-6 text-center text-slate-400 font-bold text-sm">{idx + 1}</span>
                        <span className="flex-1 font-bold text-slate-800">{provider.name}</span>
                        <span className="text-xs text-slate-500 uppercase tracking-wide">({provider.providerId})</span>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pp.enabled}
                            onChange={e => handleToggleProvider(activeTask, pp.providerId, e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-slate-600">Enabled</span>
                        </label>

                        <select
                          value={pp.strategy}
                          onChange={e => handleStrategyChange(activeTask, pp.providerId, e.target.value as any)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold appearance-none"
                        >
                          <option value="fallback">Fallback</option>
                          <option value="round-robin">Round-robin</option>
                          <option value="priority">Priority</option>
                        </select>

                        <input
                          type="number" inputMode="numeric"
                          value={pp.weight}
                          onChange={e => {
                            const newPriority = [...config.providerPriority];
                            newPriority[idx] = { ...newPriority[idx], weight: parseInt(e.target.value) };
                            updateConfig(activeTask, { providerPriority: newPriority });
                          }}
                          min="1"
                          className="w-16 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-center"
                        />

                        <button
                          onClick={() => handleRemoveProvider(activeTask, pp.providerId)}
                          className="px-3 py-1.5 bg-rose-100 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-200"
                        >
                          🗑️ Xóa
                        </button>
                      </div>

                      {/* Models for this provider */}
                      <div className="ml-6 sm:ml-12 pt-3 border-l-2 border-slate-100 space-y-2">
                          {providerModels.map((pm, mIdx) => {
                            const modelInfo = getModelInfo(activeTask, pp.providerId, pm.modelId);
                            return (
                              <div key={pm.modelId} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <button
                                  onClick={() => mIdx > 0 && handleModelReorder(activeTask, pp.providerId, mIdx, mIdx - 1)}
                                  disabled={mIdx === 0}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => mIdx < providerModels.length - 1 && handleModelReorder(activeTask, pp.providerId, mIdx, mIdx + 1)}
                                  disabled={mIdx === providerModels.length - 1}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                >
                                  ↓
                                </button>
                                <span className="w-6 text-center text-slate-400 font-bold text-xs">{mIdx + 1}</span>
                                <span className={`flex-1 font-medium ${modelInfo?.isFreeTier ? 'text-emerald-700' : 'text-slate-700'}`}>
                                  {modelInfo?.isFreeTier ? '🆓 ' : ''}{modelInfo?.displayName || pm.modelId}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">
                                  {modelInfo?.capabilities?.vision ? '👁️ Vision' : '💬 Chat'}
                                </span>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={pm.enabled}
                                    onChange={e => handleToggleModel(activeTask, pp.providerId, pm.modelId, e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span className="text-xs text-slate-600">Enabled</span>
                                </label>
                                <input
                                  type="number" inputMode="numeric"
                                  value={pm.weight}
                                  onChange={e => {
                                    const newModels = [...config.modelPriority];
                                    const idx = newModels.findIndex(m => m.providerId === pp.providerId && m.modelId === pm.modelId);
                                    if (idx >= 0) newModels[idx] = { ...newModels[idx], weight: parseInt(e.target.value) };
                                    updateConfig(activeTask, { modelPriority: newModels });
                                  }}
                                  min="1"
                                  className="w-14 px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-center"
                                />
                                <button
                                  onClick={() => handleRemoveModel(activeTask, pp.providerId, pm.modelId)}
                                  className="px-2 py-1.5 bg-rose-100 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-200"
                                >
                                  🗑️
                                </button>
                              </div>
                            );
                          })}
                          <div className="pt-2">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="text-xs font-bold text-slate-500">Model có thể chọn cho task này</span>
                              <button
                                onClick={() => loadTaskProviderModels(pp.providerId, activeTask, true).catch((err: any) => {
                                  console.error('[AITaskMapping] Refresh task models failed:', err);
                                  setError(err.message || 'Không cập nhật được danh sách model');
                                })}
                                disabled={loadingTaskModels[providerModelCacheKey]}
                                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 disabled:opacity-50"
                              >
                                {loadingTaskModels[providerModelCacheKey] ? '⏳ Đang tải...' : '🔄 Tải/cập nhật model'}
                              </button>
                            </div>
                            {modelsToAdd.length > 0 && (
                              <input
                                type="search"
                                value={taskModelFilters[providerModelCacheKey] || ''}
                                onChange={e => setTaskModelFilters(prev => ({
                                  ...prev,
                                  [providerModelCacheKey]: e.target.value,
                                }))}
                                placeholder="Tìm theo tên hoặc mã model..."
                                aria-label={`Tìm model cho ${provider.name} trong task ${TASK_LABELS[activeTask]}`}
                                className="w-full mb-3 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            )}
                            {filteredTaskModels.map(model => (
                              <button
                                key={model.modelId}
                                onClick={() => handleAddModel(activeTask, pp.providerId, model.modelId)}
                                className="mr-2 mb-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-100 hover:bg-emerald-100"
                              >
                                ➕ {model.isFreeTier ? '🆓 ' : ''}{model.displayName || model.modelId}
                                {model.capabilities?.vision ? ' 👁️' : ''}
                              </button>
                            ))}
                            {!loadingTaskModels[providerModelCacheKey] && modelsToAdd.length > 0 && filteredTaskModels.length === 0 && (
                              <p className="text-xs text-slate-400">
                                Không tìm thấy model khớp “{taskModelFilters[providerModelCacheKey]}”.
                              </p>
                            )}
                            {!loadingTaskModels[providerModelCacheKey] && modelsToAdd.length === 0 && (
                              <p className="text-xs text-slate-400">
                                {providerAvailableModels.length > 0
                                  ? 'Provider này không còn model nào chưa được thêm cho task.'
                                  : 'Chưa có model trong cache. Bấm “Tải/cập nhật model” để lấy model từ provider.'}
                              </p>
                            )}
                          </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Section */}
      {config && (
        <div className="space-y-6 pt-6 border-t border-slate-200">
          <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider flex items-center gap-2">
            <span className="text-lg">🧪</span> Test AI Provider
          </h3>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50/50 border-b border-slate-100">
              <h4 className="font-black text-slate-700 uppercase tracking-widest text-sm flex items-center gap-2">
                <span className="text-lg">⚙️</span> Cấu hình Test
              </h4>
            </div>
            <div className="p-5 space-y-5">
              {/* Provider Selection (single) */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                  1. Chọn Provider
                </label>
                <div className="flex flex-wrap gap-2">
                  {providers.map(p => (
                    <button
                      key={p._id}
                      onClick={() => handleTestProviderSelect(p._id)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        selectedTestProvider === p._id
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      {p.name} <span className="opacity-60 text-xs">({p.providerId})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selection (single) — chọn model TRƯỚC khi nhập prompt */}
              {selectedTestProvider && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500">
                      2. Chọn Model
                      {isVisionTask && (
                        <span className="ml-2 normal-case tracking-normal text-amber-600">
                          (task này chỉ hiện model có 👁️ Vision)
                        </span>
                      )}
                    </label>
                    <button
                      onClick={() => refreshModelsFromProvider(selectedTestProvider)}
                      disabled={isLoadingModels}
                      className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 disabled:opacity-50"
                    >
                      {isLoadingModels ? '⏳ Đang tải...' : '🔄 Cập nhật từ provider'}
                    </button>
                  </div>

                  <input
                    type="text"
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    placeholder="Tìm model (vd: gemini, gpt-4o, deepseek)..."
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                  />

                  <div className="mt-3 max-h-56 overflow-y-auto flex flex-wrap gap-2 p-1">
                    {visibleModels.map(m => (
                      <button
                        key={m.modelId}
                        onClick={() => setSelectedTestModel(m.modelId)}
                        title={m.modelId}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          selectedTestModel === m.modelId
                            ? 'bg-emerald-600 text-white shadow'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {m.displayName}
                        {m.capabilities?.vision ? ' 👁️' : ''}
                        {m.isFreeTier ? ' 🆓' : ''}
                      </button>
                    ))}

                    {isLoadingModels && discoveredModels.length === 0 && (
                      <span className="text-sm text-slate-400">Đang tải danh sách model...</span>
                    )}
                    {!isLoadingModels && filteredModels.length === 0 && (
                      <span className="text-sm text-slate-400">
                        {discoveredModels.length === 0
                          ? 'Provider chưa có model nào — bấm "Cập nhật từ provider" để lấy về'
                          : `Không có model nào khớp "${modelFilter}"`}
                      </span>
                    )}
                  </div>

                  {hiddenModelCount > 0 && (
                    <p className="text-xs text-slate-400 mt-2">
                      Còn {hiddenModelCount} model khác — gõ vào ô tìm kiếm để lọc.
                    </p>
                  )}
                </div>
              )}

              {/* Prompt Input */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                  3. Nhập prompt gửi tới model đã chọn
                </label>
                <textarea
                  value={testPrompt}
                  onChange={handleTestPromptChange}
                  disabled={!selectedTestModel}
                  placeholder={selectedTestModel
                    ? 'Nhập prompt test... (ví dụ: Xin chào, bạn là ai?)'
                    : 'Chọn provider và model ở trên trước đã'}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium resize-none disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Image Upload for Vision Tasks */}
              {isVisionTask && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                    Ảnh Test (cho Vision)
                    <span className="text-xs font-normal text-slate-400">(tùy chọn)</span>
                  </label>
                  {testImageBase64 ? (
                    <div className="relative group">
                      <img
                        src={testImageBase64}
                        alt="Test image preview"
                        className="max-h-48 rounded-xl border border-slate-200"
                      />
                      <button
                        onClick={clearTestImage}
                        className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleTestImageChange}
                      className="w-full px-4 py-3 rounded-xl text-sm bg-white border border-slate-200 border-dashed focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                    />
                  )}
                </div>
              )}

              {/* Tóm tắt request sắp gửi */}
              <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100 text-xs">
                <span className="font-black uppercase tracking-wider text-slate-500">Sẽ test:</span>
                <span className="px-2 py-1 bg-slate-100 rounded-lg font-bold text-slate-700">
                  {selectedTestProvider ? getProviderName(selectedTestProvider) : '— chưa chọn provider —'}
                </span>
                <span className="text-slate-400">→</span>
                <span className={`px-2 py-1 rounded-lg font-bold ${selectedTestModel ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {selectedTestModel || '— chưa chọn model —'}
                </span>
                {selectedModelInfo?.capabilities?.vision && (
                  <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-bold">👁️ Vision</span>
                )}
                {selectedModelInfo?.isFreeTier && (
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-bold">🆓 Free tier</span>
                )}
              </div>

              {/* Run Test Button */}
              <div className="flex gap-3">
                <button
                  onClick={runSingleModelTest}
                  disabled={isTesting || !selectedTestProvider || !selectedTestModel || (!testPrompt.trim() && !testImageBase64)}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTesting ? '⏳ Đang test...' : '🚀 Chạy Test'}
                </button>
                <button
                  onClick={() => {
                    setSelectedTestProvider('');
                    setSelectedTestModel('');
                    setDiscoveredModels([]);
                    setModelFilter('');
                    setTestPrompt('');
                    setTestImageBase64(null);
                    setTestOutput('');
                    setTestUsage(null);
                    clearMessages();
                  }}
                  className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-sm hover:bg-slate-200"
                >
                  Làm mới
                </button>
              </div>
            </div>
          </div>

          {/* Test Output */}
          {testOutput && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <h4 className="font-black text-slate-700 uppercase tracking-widest text-sm flex items-center gap-2">
                  <span className="text-lg">📊</span> Kết quả Test
                </h4>
                <span className="font-bold text-slate-700 text-sm">
                  {getProviderName(selectedTestProvider)} → {selectedTestModel}
                </span>
              </div>
              <div className="p-4">
                <p className="font-black text-slate-600 text-sm uppercase tracking-wide mb-2">Phản hồi:</p>
                <div className={`p-4 rounded-xl border whitespace-pre-wrap font-mono text-sm max-h-80 overflow-y-auto ${
                  testOutput.startsWith('LỖI:')
                    ? 'bg-rose-50 border-rose-100 text-rose-600'
                    : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                }`}>
                  {testOutput}
                </div>

                {testUsage && (
                  <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-100 text-xs">
                    <div className="bg-emerald-100 p-2 rounded text-center">
                      <div className="font-bold text-emerald-700">{testUsage.prompt_tokens || 0}</div>
                      <div className="text-emerald-500">Prompt</div>
                    </div>
                    <div className="bg-blue-100 p-2 rounded text-center">
                      <div className="font-bold text-blue-700">{testUsage.completion_tokens || 0}</div>
                      <div className="text-blue-500">Completion</div>
                    </div>
                    <div className="bg-purple-100 p-2 rounded text-center">
                      <div className="font-bold text-purple-700">{testUsage.total_tokens || 0}</div>
                      <div className="text-purple-500">Total</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

AITaskMappingPanel.displayName = 'AITaskMappingPanel';
export default AITaskMappingPanel;