/**
 * AI Provider Admin Routes
 * Full CRUD for providers, API keys, models, task configs, and logs
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import {
  AIProvider,
  AIModel,
  AITaskConfig,
  AILog,
  discoverModelsForProvider,
  getCachedModels,
  getAvailableModelsForTask,
  checkAllProvidersHealth,
  logAIRequest,
  getLogs,
  getLogStats,
  getDebugModeStatus,
  setDebugModeStatus,
  cleanLogs,
  resetKeyCooldown,
  encrypt,
  decrypt,
  maskApiKey,
  getProviderDefinition,
  getAllProviderDefinitions,
  convertGeminiPayload,
  type GatewayConfig,
} from '../services/ai/index.ts';

const router = Router();
const AI_TASK_TYPES = ['chat', 'coach', 'vision', 'verify', 'food', 'meal-plan', 'embedding'] as const;
type AITaskType = typeof AI_TASK_TYPES[number];

// Apply auth and permission middleware
router.use(authMiddleware);
router.use(requirePermission(RESOURCES.AI.MANAGE));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function logAdmin(req: Request, action: string, detail = ''): void {
  const who = (req as any).user?.fullName || (req as any).user?.username || 'Unknown';
  console.log(`[AI-Admin] ${who} ${action}${detail ? `: ${detail}` : ''}`);
}

function generateRequestId(): string {
  return 'adm-' + Math.random().toString(36).substring(7).toUpperCase();
}

function isAITaskType(taskType: string): taskType is AITaskType {
  return (AI_TASK_TYPES as readonly string[]).includes(taskType);
}

async function ensureTaskConfig(taskType: AITaskType) {
  const existingConfig = await AITaskConfig.findOne({ taskType });
  if (existingConfig) return existingConfig;

  try {
    const config = await AITaskConfig.create({ taskType, updatedBy: 'system' });
    console.log(`[AI-TaskMapping] Initialized missing task config: ${taskType}`);
    return config;
  } catch (error: any) {
    if (error.code !== 11000) throw error;
    const concurrentlyCreatedConfig = await AITaskConfig.findOne({ taskType });
    if (!concurrentlyCreatedConfig) throw error;
    return concurrentlyCreatedConfig;
  }
}

function sanitizeProviderForResponse(provider: any) {
  return {
    _id: provider._id,
    providerId: provider.providerId,
    name: provider.name,
    isEnabled: provider.isEnabled,
    baseUrl: provider.baseUrl,
    customHeaders: provider.customHeaders?.map((h: any) => ({ key: h.key, value: h.isSecret ? '[REDACTED]' : h.value, isSecret: h.isSecret })) || [],
    selectedModelIds: provider.selectedModelIds,
    strategy: provider.strategy,
    defaultTimeoutMs: provider.defaultTimeoutMs,
    defaultRetries: provider.defaultRetries,
    apiKeys: provider.apiKeys?.map((k: any) => ({
      _id: k._id,
      label: k.label,
      isActive: k.isActive,
      priority: k.priority,
      lastUsed: k.lastUsed,
      failCount: k.failCount,
      cooldownUntil: k.cooldownUntil,
      maskedKey: maskApiKey(decrypt(k.key)),
    })) || [],
    activeKeysCount: provider.apiKeys?.filter((k: any) => k.isActive && (!k.cooldownUntil || k.cooldownUntil < new Date())).length || 0,
    createdBy: provider.createdBy,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

// ============================================================================
// PROVIDER DEFINITIONS (for dropdown)
// ============================================================================

router.get('/definitions', async (req: Request, res: Response) => {
  try {
    const definitions = getAllProviderDefinitions();
    res.json({ definitions });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// PROVIDERS CRUD
// ============================================================================

// GET /api/admin/ai/providers - List all providers
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = await AIProvider.find().sort({ createdAt: -1 }).lean();
    res.json({ providers: providers.map(sanitizeProviderForResponse) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/ai/providers - Create new provider
router.post('/providers', async (req: Request, res: Response) => {
  try {
    const {
      providerId,
      name,
      baseUrl,
      customHeaders,
      selectedModelIds,
      strategy,
      defaultTimeoutMs,
      defaultRetries,
      apiKeys
    } = req.body;

    // Validate providerId
    const def = getProviderDefinition(providerId);
    if (!def) {
      return res.status(400).json({ message: 'Invalid providerId' });
    }

    // For custom/selfhosted, baseUrl is required
    if (def.requiresCustomUrl && !baseUrl) {
      return res.status(400).json({ message: 'Base URL is required for custom/self-hosted providers' });
    }

    // Encrypt API keys
    const encryptedKeys = (apiKeys || []).map((k: any, i: number) => ({
      key: encrypt(k.key),
      label: k.label || `Key ${i + 1}`,
      isActive: k.isActive !== false,
      priority: k.priority || i + 1,
    }));

    const provider = await AIProvider.create({
      providerId,
      name: name || def.name,
      baseUrl: baseUrl || def.baseUrl,
      customHeaders: customHeaders || [],
      selectedModelIds: selectedModelIds || [],
      strategy: strategy || 'fallback',
      defaultTimeoutMs: defaultTimeoutMs || def.defaultTimeoutMs,
      defaultRetries: defaultRetries ?? def.defaultRetries,
      apiKeys: encryptedKeys,
      isEnabled: true,
      createdBy: (req as any).user?.fullName || 'admin',
    });

    logAdmin(req, 'tạo provider', provider.name);
    res.json({ success: true, provider: sanitizeProviderForResponse(provider) });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Provider đã tồn tại' });
    }
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/ai/providers/:id - Update provider
router.put('/providers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow changing providerId
    delete updates.providerId;
    delete updates.apiKeys; // Keys managed separately

    if (updates.customHeaders) {
      updates.customHeaders = updates.customHeaders.map((h: any) => ({
        key: h.key,
        value: h.isSecret && h.value && !h.value.startsWith('[REDACTED]') ? encrypt(h.value) : h.value,
        isSecret: h.isSecret,
      }));
    }

    const provider = await AIProvider.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    logAdmin(req, 'cập nhật provider', provider.name);
    res.json({ success: true, provider: sanitizeProviderForResponse(provider) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/ai/providers/:id - Delete provider
router.delete('/providers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await AIProvider.findByIdAndDelete(id);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    // Also delete associated models and task configs references
    await AIModel.deleteMany({ providerId: id });
    // Note: Task configs still reference this providerId, admin should remove them first

    logAdmin(req, 'xóa provider', provider.name);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/ai/providers/:id/discover - Discover models
router.post('/providers/:id/discover', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await AIProvider.findById(id);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const result = await discoverModelsForProvider(provider);
    logAdmin(req, 'discover models', `${provider.name}: ${result.models.length} models`);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/ai/providers/discover-inline - Discover models from config (without saving)
router.post('/providers/discover-inline', async (req: Request, res: Response) => {
  try {
    console.log('[DiscoverInline] Full request body:', JSON.stringify(req.body, null, 2));

    const { providerId, baseUrl, apiKey, customHeaders, apiKeys } = req.body;

    if (!providerId || !baseUrl) {
      return res.status(400).json({ message: 'providerId and baseUrl are required' });
    }

    // Encrypt keys for discoverModelsForProvider (expects encrypted keys like from DB)
    const { encrypt } = await import('../utils/encryption.ts');

    console.log('[DiscoverInline] Raw apiKeys from request:', JSON.stringify(apiKeys, null, 2));

    // Build a temporary provider object for discovery
    // Accept all keys that have a non-empty value (frontend may not send isActive)
    const filteredKeys = (apiKeys || []).filter((k: any) => k?.key?.trim()).map((k: any) => ({
      key: encrypt(k.key),
      isActive: true,
      priority: k.priority || 1,
      label: k.label || 'Key',
    }));

    console.log('[DiscoverInline] Filtered keys count:', filteredKeys.length);

    const tempProvider = {
      _id: 'inline',
      providerId,
      name: req.body.name || providerId,
      baseUrl,
      apiKeys: filteredKeys.length > 0 ? filteredKeys : (apiKey ? [{ key: encrypt(apiKey), isActive: true, priority: 1, label: 'Inline Key' }] : []),
      customHeaders: customHeaders || [],
    };

    console.log('[DiscoverInline] Temp provider apiKeys:', tempProvider.apiKeys?.map(k => ({ label: k.label, isActive: k.isActive, hasKey: !!k.key })));

    const result = await discoverModelsForProvider(tempProvider as any);
    console.log('[DiscoverInline] Result:', { success: !result.error, modelsCount: result.models?.length, error: result.error });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[DiscoverInline] Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/ai/providers/:id/test - Test connection
router.post('/providers/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await AIProvider.findById(id);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const activeKey = provider.apiKeys.find((k: any) => k.isActive && (!k.cooldownUntil || k.cooldownUntil < new Date()));
    if (!activeKey) {
      return res.status(400).json({ message: 'No active API key available' });
    }

    const def = getProviderDefinition(provider.providerId);
    const baseUrl = provider.baseUrl || def?.baseUrl;

    const models = await getCachedModels(provider._id.toString());

    // Try a simple completion
    const { callGateway } = await import('../services/ai/providerGateway.ts');
    const result = await callGateway({
      baseUrl,
      apiKey: decrypt(activeKey.key),
      model: provider.selectedModelIds[0] || models[0]?.modelId || 'test',
      timeoutMs: 15000,
      retries: 0,
      authType: def?.authType || 'bearer',
    }, [{ role: 'user', content: 'Say "OK" if you can hear me.' }], generateRequestId());

    logAdmin(req, 'test connection', `${provider.name}: ${result.durationMs}ms`);
    res.json({ success: true, ...result, modelCount: models.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/ai/providers/discover-all - Discover models for all providers
router.post('/providers/discover-all', async (req: Request, res: Response) => {
  try {
    const { discoverModelsForAllProviders } = await import('../services/ai/modelDiscovery.ts');
    const results = await discoverModelsForAllProviders();
    const totalModels = results.reduce((sum, r) => sum + r.models.length, 0);
    logAdmin(req, 'discover all models', `${results.length} providers, ${totalModels} models`);
    res.json({ success: true, results, totalModels });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// API KEYS MANAGEMENT
// ============================================================================

// PUT /api/admin/ai/providers/:id/keys - Update all keys (replace)
router.put('/providers/:id/keys', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { apiKeys } = req.body;

    const provider = await AIProvider.findById(id);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    // Encrypt new keys
    const encryptedKeys = (apiKeys || []).map((k: any, i: number) => {
      // If key looks already encrypted (contains :), keep as is
      const isEncrypted = k.key && k.key.includes(':') && k.key.split(':').length === 3;
      return {
        _id: k._id,
        key: isEncrypted ? k.key : encrypt(k.key),
        label: k.label || `Key ${i + 1}`,
        isActive: k.isActive !== false,
        priority: k.priority || i + 1,
        lastUsed: k.lastUsed,
        failCount: k.failCount || 0,
        cooldownUntil: k.cooldownUntil,
      };
    });

    provider.apiKeys = encryptedKeys;
    await provider.save();

    logAdmin(req, 'cập nhật API keys', `${provider.name}: ${encryptedKeys.length} keys`);
    res.json({ success: true, provider: sanitizeProviderForResponse(provider) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/ai/providers/:id/keys/:keyId/toggle - Toggle key active
router.put('/providers/:id/keys/:keyId/toggle', async (req: Request, res: Response) => {
  try {
    const { id, keyId } = req.params;
    const { isActive } = req.body;

    const provider = await AIProvider.findById(id);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const key = provider.apiKeys.id(keyId);
    if (!key) {
      return res.status(404).json({ message: 'Key not found' });
    }

    key.isActive = isActive;
    if (isActive) {
      key.cooldownUntil = null;
      key.failCount = 0;
    }
    await provider.save();

    logAdmin(req, isActive ? 'bật key' : 'tắt key', `${provider.name}/${key.label}`);
    res.json({ success: true, provider: sanitizeProviderForResponse(provider) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/ai/providers/:id/keys/:keyId/reset-cooldown - Reset key cooldown
router.post('/providers/:id/keys/:keyId/reset-cooldown', async (req: Request, res: Response) => {
  try {
    const { id, keyId } = req.params;

    await resetKeyCooldown(id, keyId);

    const provider = await AIProvider.findById(id);
    logAdmin(req, 'reset cooldown', `${provider?.name}/key:${keyId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// MODELS
// ============================================================================

// GET /api/admin/ai/providers/:id/models - List models for provider
router.get('/providers/:id/models', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { taskType } = req.query;

    const models = await getCachedModels(id, taskType as string);
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/ai/providers/:id/models/:modelId/toggle - Toggle model active
router.put('/providers/:id/models/:modelId/toggle', async (req: Request, res: Response) => {
  try {
    const { id, modelId } = req.params;
    const { isActive } = req.body;

    const model = await AIModel.findOneAndUpdate(
      { providerId: id, modelId },
      { isActive },
      { new: true }
    );

    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    logAdmin(req, isActive ? 'bật model' : 'tắt model', modelId);
    res.json({ success: true, model });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// TASK CONFIGS
// ============================================================================

// GET /api/admin/ai/task-configs - List all task configs
router.get('/task-configs', async (req: Request, res: Response) => {
  try {
    await Promise.all(AI_TASK_TYPES.map(taskType => ensureTaskConfig(taskType)));
    const configs = await AITaskConfig.find().lean();

    // Populate provider names
    const providerIds = [...new Set(configs.flatMap(c => c.providerPriority.map((p: any) => p.providerId)))];
    const providers = await AIProvider.find({ _id: { $in: providerIds } }).lean();
    const providerMap = new Map(providers.map(p => [p._id.toString(), p]));

    const enriched = configs.map(config => ({
      ...config,
      providerPriority: config.providerPriority.map((p: any) => ({
        ...p,
        providerName: providerMap.get(p.providerId.toString())?.name || 'Unknown',
        providerType: providerMap.get(p.providerId.toString())?.providerId || 'unknown',
      })),
      modelPriority: config.modelPriority.map((m: any) => ({
        ...m,
        providerName: providerMap.get(m.providerId.toString())?.name || 'Unknown',
      })),
    }));

    res.json({ taskConfigs: enriched });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/ai/task-configs/:taskType - Get single task config with available models
router.get('/task-configs/:taskType', async (req: Request, res: Response) => {
  try {
    const { taskType } = req.params;
    if (!isAITaskType(taskType)) {
      return res.status(400).json({ message: 'Task type không hợp lệ.' });
    }
    const config = await ensureTaskConfig(taskType);

    // Get available models for this task
    const availableModels = await getAvailableModelsForTask(taskType);

    res.json({ taskConfig: config.toObject(), availableModels });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/ai/task-configs/:taskType - Update task config
router.put('/task-configs/:taskType', async (req: Request, res: Response) => {
  try {
    const { taskType } = req.params;
    const {
      providerPriority,
      modelPriority,
      globalFallbackEnabled,
      defaultProviderStrategy
    } = req.body;

    const config = await AITaskConfig.findOneAndUpdate(
      { taskType },
      {
        providerPriority,
        modelPriority,
        globalFallbackEnabled,
        defaultProviderStrategy,
        updatedBy: (req as any).user?.fullName || 'admin',
      },
      { new: true, upsert: true }
    );

    logAdmin(req, 'cập nhật task config', taskType);
    res.json({ success: true, taskConfig: config });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// LOGS
// ============================================================================

// GET /api/admin/ai/logs - List logs with filters
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      taskType: req.query.taskType as string,
      providerId: req.query.providerId as string,
      status: req.query.status as string,
      userId: req.query.userId as string,
      requestId: req.query.requestId as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      logLevel: req.query.logLevel as string,
    };

    const result = await getLogs(filters);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/ai/logs/stats - Get stats for dashboard
router.get('/logs/stats', async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const stats = await getLogStats(hours);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/ai/logs/debug-mode - Get debug mode status
router.get('/logs/debug-mode', async (req: Request, res: Response) => {
  try {
    const status = await getDebugModeStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/ai/logs/debug-mode - Toggle debug mode
router.put('/logs/debug-mode', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const result = await setDebugModeStatus(enabled);
    logAdmin(req, enabled ? 'bật debug mode' : 'tắt debug mode');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/ai/logs - Clean old logs
router.delete('/logs', async (req: Request, res: Response) => {
  try {
    const olderThanDays = parseInt(req.query.olderThanDays as string) || 30;
    const result = await cleanLogs(olderThanDays);
    logAdmin(req, 'dọn dẹp logs', `xóa ${result.deletedCount} logs cũ hơn ${olderThanDays} ngày`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

// GET /api/admin/ai/health - Check all providers health
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await checkAllProvidersHealth();
    res.json({ providers: health });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// TEST AI
// ============================================================================

// POST /api/admin/ai/test - Test AI with current task config
router.post('/test', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const { taskType, prompt, imageBase64, modelName } = req.body;

    if (!taskType) {
      return res.status(400).json({ message: 'taskType is required' });
    }

    const { callAI } = await import('../services/ai/oaiRouter.ts');

    const payload = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt || 'Test connection. Reply with "OK".' },
          ...(imageBase64 ? [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] : [])
        ]
      }],
      config: {}
    };

    const result = await callAI(requestId, taskType as any, payload, {
      userId: (req as any).user?.userId,
      modelName,
    });

    logAdmin(req, 'test AI', `${taskType}: ${result.durationMs}ms`);
    res.json({ success: true, ...result });
  } catch (err: any) {
    logAdmin(req, 'test AI thất bại', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/ai/test-custom - Test AI with specific provider/model (bypass task config)
router.post('/test-custom', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const { taskType, prompt, imageBase64, providerId, modelId, providerConfig } = req.body;

    if (!taskType || !providerId || !modelId) {
      return res.status(400).json({ message: 'taskType, providerId, modelId are required' });
    }

    // Fetch provider
    const provider = await AIProvider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    // Find model
    const model = await AIModel.findOne({ providerId, modelId, isActive: true });
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check vision capability for vision tasks
    if (['vision', 'verify', 'food'].includes(taskType) && !model.capabilities?.vision) {
      return res.status(400).json({ message: 'Selected model does not support vision' });
    }

    // Get active key
    const activeKey = provider.apiKeys.find((k: any) => k.isActive && (!k.cooldownUntil || k.cooldownUntil < new Date()));
    if (!activeKey) {
      return res.status(400).json({ message: 'No active API key available for this provider' });
    }

    const { callGateway } = await import('../services/ai/providerGateway.ts');
    const def = getProviderDefinition(provider.providerId);

    const messages = convertGeminiPayload({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt || 'Test connection. Reply with "OK".' },
          ...(imageBase64 ? [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] : [])
        ]
      }],
      config: {}
    }, undefined);

    const gatewayConfig: GatewayConfig = {
      baseUrl: provider.baseUrl || def?.baseUrl,
      apiKey: decrypt(activeKey.key),
      model: modelId,
      timeoutMs: provider.defaultTimeoutMs || def?.defaultTimeoutMs || 45000,
      retries: provider.defaultRetries ?? def?.defaultRetries ?? 2,
      authType: def?.authType || 'bearer',
      // GatewayConfig expects a plain header map, not the [{key,value}] array stored on the provider
      customHeaders: ((provider.customHeaders || []) as any[]).reduce((acc: Record<string, string>, h: any) => {
        if (h?.key) acc[h.key] = h.isSecret && h.value ? decrypt(h.value) : h.value;
        return acc;
      }, {}),
    };

    const result = await callGateway(gatewayConfig, messages, requestId);

    logAdmin(req, 'test custom AI', `${provider.name}/${modelId}: ${result.durationMs}ms`);
    res.json({ success: true, ...result, providerUsed: provider.name, modelUsed: modelId });
  } catch (err: any) {
    logAdmin(req, 'test custom AI thất bại', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;