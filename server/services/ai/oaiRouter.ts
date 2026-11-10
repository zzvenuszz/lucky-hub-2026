/**
 * OpenAI-Compatible AI Router
 * Two-level strategy:
 *   Level 1: Provider priority (round-robin / fallback / priority)
 *   Level 2: Model/Key priority within provider (round-robin / fallback / priority)
 */

import { AIProvider } from '../../models/AIProvider.ts';
import { AIModel } from '../../models/AIModel.ts';
import { AITaskConfig } from '../../models/AITaskConfig.ts';
import {
  callGateway,
  listModels,
  convertGeminiPayload,
  GatewayConfig,
  GatewayMessage,
  GatewayError
} from './providerGateway.ts';
import {
  logAIRequest,
  logFallback,
  logRateLimit,
  logKeyCooldown,
  getDebugMode
} from './logService.ts';
import { getProviderDefinition } from '../../config/aiProviders.ts';
import { decrypt } from '../../utils/encryption.ts';

/** Task types supported */
export type AITaskType = 'chat' | 'coach' | 'vision' | 'verify' | 'food' | 'meal-plan' | 'embedding';

/** Standardized result */
export interface AICallResult {
  text: string;
  resolvedModel?: string;
  usage?: any;
  cost?: number;
  durationMs?: number;
  providerUsed?: string;
  modelUsed?: string;
  keyLabel?: string;
  fallbackAttempt?: number;
}

/** Call options */
export interface CallAIOptions {
  userId?: string;
  modelName?: string; // 'auto' or specific model override
  retries?: number;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'none';
  system?: string; // Override system prompt
}

/** Internal model option with all context needed for calling */
interface ModelOption {
  provider: any; // AIProviderDoc
  model: any;    // AIModelDoc
  apiKey: { key: string; label: string; priority: number; index: number };
  providerStrategy: 'round-robin' | 'fallback' | 'priority';
  modelStrategy: 'round-robin' | 'fallback' | 'priority';
  providerWeight: number;
  modelWeight: number;
}

/** Task labels for logging */
const TASK_LABELS: Record<AITaskType, string> = {
  chat: 'Chat',
  coach: 'AI Coach',
  vision: 'Vision Analysis',
  verify: 'Avatar Verification',
  food: 'Food Analysis',
  'meal-plan': 'Meal Planning',
  embedding: 'Embedding',
};

/** Vision-required tasks */
const VISION_TASKS: AITaskType[] = ['vision', 'verify', 'food'];

/**
 * Main entry point - compatible with old callAI signature
 */
export async function callAI(
  requestId: string,
  taskType: AITaskType,
  payload: any,
  options: CallAIOptions = {}
): Promise<AICallResult> {
  const userId = options.userId || 'anonymous';
  const startTime = Date.now();
  const debugMode = getDebugMode();
  const debugData: any = { modelOptionsTried: [] };

  // ENABLE DETAILED TRACING FOR DEBUGGING
  const TRACE = true;

  if (TRACE) {
    console.log(`[TRACE] >>> callAI START | req=${requestId} | task=${taskType} | user=${userId} | modelOverride=${options.modelName || 'auto'}`);
  }

  try {
    // 1. Get task configuration
    const taskConfig = await AITaskConfig.findOne({ taskType }).lean();
    if (!taskConfig) {
      throw new Error(`No task configuration found for: ${taskType}`);
    }

    if (TRACE) {
      console.log(`[TRACE] Task config loaded | providerPriority count=${taskConfig.providerPriority.length} | modelPriority count=${taskConfig.modelPriority.length} | globalFallback=${taskConfig.globalFallbackEnabled}`);
      console.log(`[TRACE] Provider priorities:`, taskConfig.providerPriority.map(p => ({
        providerId: p.providerId.toString().substring(0,8),
        enabled: p.enabled,
        strategy: p.strategy,
        weight: p.weight
      })));
      console.log(`[TRACE] Model priorities:`, taskConfig.modelPriority.map(m => ({
        providerId: m.providerId.toString().substring(0,8),
        modelId: m.modelId,
        enabled: m.enabled,
        weight: m.weight,
        apiKeyIndex: m.apiKeyIndex
      })));
    }

    // 2. Build model options from task config (2-level priority)
    const modelOptions = await buildModelOptions(taskConfig, taskType, true);
    if (modelOptions.length === 0) {
      throw new Error(`No available models configured for task: ${taskType}`);
    }

    if (TRACE) {
      console.log(`[TRACE] Built ${modelOptions.length} model options:`);
      for (const opt of modelOptions) {
        console.log(`  - Provider: ${opt.provider.name} (${opt.provider.providerId}) [${opt.provider._id.toString().substring(0,8)}...] | Model: ${opt.model.modelId} | Key: ${opt.apiKey.label} (idx=${opt.apiKey.index}) | Strategy: ${opt.providerStrategy}`);
      }
    }

    // 3. Convert payload to OpenAI format
    const messages = convertGeminiPayload(payload, options.system);
    if (debugMode) debugData.requestPayload = payload;

    if (TRACE) {
      console.log(`[TRACE] Messages prepared for gateway: ${messages.length} messages`);
      console.log(`[TRACE] First message:`, JSON.stringify(messages[0], null, 2).substring(0, 500));
    }

    // 4. Select provider order based on global strategy
    const providerOrder = selectProviderOrder(taskConfig, modelOptions);

    if (TRACE) {
      console.log(`[TRACE] Provider order (after strategy):`, providerOrder.map(p => ({
        providerId: p.providerId.toString().substring(0,8),
        providerName: p.providerName,
        strategy: p.strategy,
        weight: p.weight,
        modelOptionsCount: p.options.length
      })));
    }

    // 5. Try each provider in order
    let lastError: Error | null = null;
    let fallbackAttempt = 0;
    let previousProvider = '';
    let previousModel = '';

    for (const providerConfig of providerOrder) {
      const providerOptions = modelOptions.filter(o => o.provider._id.toString() === providerConfig.providerId.toString());
      if (providerOptions.length === 0) {
        if (TRACE) console.log(`[TRACE] No options for provider ${providerConfig.providerId.toString().substring(0,8)}, skipping`);
        continue;
      }

      // Select model/key order within this provider
      const modelOrder = selectModelOrder(providerConfig, providerOptions);

      if (TRACE) {
        console.log(`[TRACE] Trying provider ${providerConfig.providerName} (${providerConfig.providerId.toString().substring(0,8)}) with ${modelOrder.length} model options`);
      }

      for (const option of modelOrder) {
        fallbackAttempt++;
        const attemptStartTime = Date.now();

        if (TRACE) {
          console.log(`[TRACE] Attempt ${fallbackAttempt} | Provider: ${option.provider.name} (${option.provider._id.toString().substring(0,8)}) | Model: ${option.model.modelId} | Key: ${option.apiKey.label} (idx=${option.apiKey.index})`);
        }

        try {
          // Build gateway config
          const gatewayConfig = buildGatewayConfig(option, options);

          if (TRACE) {
            console.log(`[TRACE] Gateway config:`, {
              baseUrl: gatewayConfig.baseUrl,
              model: gatewayConfig.model,
              authType: gatewayConfig.authType,
              timeoutMs: gatewayConfig.timeoutMs,
              retries: gatewayConfig.retries,
              hasCustomHeaders: !!gatewayConfig.customHeaders && Object.keys(gatewayConfig.customHeaders).length > 0,
              customHeaders: gatewayConfig.customHeaders
            });
          }

          // Call gateway
          const result = await callGateway(gatewayConfig, messages, requestId);

          const durationMs = Date.now() - startTime;
          const attemptDuration = Date.now() - attemptStartTime;

          // Log success
          logAIRequest({
            requestId,
            taskType,
            userId,
            providerId: option.provider._id.toString(),
            providerName: option.provider.name,
            modelId: option.model.modelId,
            apiKeyLabel: option.apiKey.label,
            durationMs: attemptDuration,
            queueTimeMs: 0,
            status: fallbackAttempt > 1 ? 'fallback' : 'success',
            fallbackFrom: fallbackAttempt > 1 ? `${previousProvider}/${previousModel}` : undefined,
            fallbackAttempt: fallbackAttempt > 1 ? fallbackAttempt : undefined,
            usage: mapGatewayUsage(result.usage, result.cost),
            debugData: debugMode ? debugData : undefined,
          });

          if (fallbackAttempt > 1) {
            logFallback({
              requestId,
              taskType,
              fromProvider: previousProvider,
              fromModel: previousModel,
              fromKeyLabel: '',
              toProvider: option.provider.name,
              toModel: option.model.modelId,
              toKeyLabel: option.apiKey.label,
              reason: lastError?.message || 'Previous attempt failed',
              attempt: fallbackAttempt,
            });
          }

          return {
            text: result.text,
            resolvedModel: result.resolvedModel,
            usage: result.usage,
            cost: result.cost,
            durationMs,
            providerUsed: option.provider.name,
            modelUsed: option.model.modelId,
            keyLabel: option.apiKey.label,
            fallbackAttempt: fallbackAttempt > 1 ? fallbackAttempt : undefined,
          };

        } catch (err: any) {
          lastError = err;
          const attemptDuration = Date.now() - attemptStartTime;

          // Log failed attempt
          const isRateLimit = err instanceof GatewayError && err.errorCode === 'RATE_LIMIT';
          const isTimeout = err instanceof GatewayError && err.errorCode === 'TIMEOUT';

          logAIRequest({
            requestId,
            taskType,
            userId,
            providerId: option.provider._id.toString(),
            providerName: option.provider.name,
            modelId: option.model.modelId,
            apiKeyLabel: option.apiKey.label,
            durationMs: attemptDuration,
            queueTimeMs: 0,
            status: isRateLimit ? 'rate_limited' : isTimeout ? 'timeout' : 'error',
            errorCode: err?.errorCode || 'GATEWAY_ERROR',
            errorMessage: err?.message,
            httpStatus: err?.status,
            debugData: debugMode ? debugData : undefined,
          });

          if (isRateLimit) {
            logRateLimit({ requestId, taskType, provider: option.provider.name, model: option.model.modelId, keyLabel: option.apiKey.label });
            // Mark key cooldown
            await markKeyCooldown(option.provider, option.apiKey.index);
          }

          debugData.modelOptionsTried.push({
            providerId: option.provider._id.toString(),
            providerName: option.provider.name,
            modelId: option.model.modelId,
            apiKeyLabel: option.apiKey.label,
            error: err?.message,
            errorCode: err?.errorCode,
            durationMs: attemptDuration,
          });

          previousProvider = option.provider.name;
          previousModel = option.model.modelId;

          // Continue to next model/key in same provider
          continue;
        }
      }

      // All models in this provider failed - try next provider if fallback enabled
      if (!taskConfig.globalFallbackEnabled) break;
    }

    // All options exhausted
    throw lastError || new Error('All models exhausted');

  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // Log final error
    logAIRequest({
      requestId,
      taskType,
      userId,
      providerId: '',
      providerName: '',
      modelId: '',
      apiKeyLabel: '',
      durationMs,
      status: 'error',
      errorCode: err?.errorCode || 'AI_ROUTER_ERROR',
      errorMessage: err?.message,
      debugData: debugMode ? debugData : undefined,
    });

    throw new Error(`AI Router Error (${taskType}): ${err?.message || 'Unknown error'}`);
  }
}

/**
 * Build all model options from task config
 */
async function buildModelOptions(taskConfig: any, taskType: AITaskType, includeWithoutKeys = false): Promise<ModelOption[]> {
  const options: ModelOption[] = [];

  // Get enabled providers in priority order
  const enabledProviders = taskConfig.providerPriority
    .filter((p: any) => p.enabled)
    .sort((a: any, b: any) => a.weight - b.weight);

  for (const providerConfig of enabledProviders) {
    const provider = await AIProvider.findById(providerConfig.providerId).lean();
    if (!provider || !provider.isEnabled) continue;

    const providerDef = getProviderDefinition(provider.providerId);
    if (!providerDef) continue;

    // Get provider's active keys
    const activeKeys = provider.apiKeys
      .filter((k: any) => k.isActive && (!k.cooldownUntil || k.cooldownUntil < new Date()))
      .sort((a: any, b: any) => a.priority - b.priority);

    if (activeKeys.length === 0) { if (!includeWithoutKeys) continue; }

    // Get models for this provider from task config
    const providerModels = taskConfig.modelPriority
      .filter((m: any) => m.providerId.toString() === providerConfig.providerId.toString() && m.enabled)
      .sort((a: any, b: any) => a.weight - b.weight);

    if (providerModels.length === 0) continue;

    // Get model details from DB
    const modelIds = providerModels.map((m: any) => m.modelId);
    const models = await AIModel.find({
      providerId: provider._id,
      modelId: { $in: modelIds },
      isActive: true
    }).lean();

    // Build options for each model/key combination
    for (const modelConfig of providerModels) {
      const model = models.find(m => m.modelId === modelConfig.modelId);
      if (!model) continue;

      // Check vision capability for vision tasks
      if (VISION_TASKS.includes(taskType) && !model.capabilities?.vision) {
        console.warn(`[Router] Skipping ${model.modelId} for ${taskType} - no vision support`);
        continue;
      }

      // Determine which key(s) to use
      let keyIndices: number[] = [];
      if (modelConfig.apiKeyIndex >= 0 && modelConfig.apiKeyIndex < activeKeys.length) {
        keyIndices = [modelConfig.apiKeyIndex];
      } else {
        // Use all active keys (will be selected by provider strategy)
        keyIndices = activeKeys.map((_, i) => i);
      }

      for (const keyIndex of keyIndices) {
        const keyDoc = activeKeys[keyIndex];
        options.push({
          provider,
          model,
          apiKey: {
            key: decrypt(keyDoc.key),
            label: keyDoc.label,
            priority: keyDoc.priority,
            index: keyIndex
          },
          providerStrategy: providerConfig.strategy || provider.strategy || 'fallback',
          modelStrategy: 'fallback', // Model-level strategy (could be extended)
          providerWeight: providerConfig.weight || 1,
          modelWeight: modelConfig.weight || 1,
        });
      }
    }
  }

  // Global fallback: add other enabled providers not in priority list
  if (taskConfig.globalFallbackEnabled) {
    const configuredProviderIds = new Set(taskConfig.providerPriority.map((p: any) => p.providerId.toString()));
    const otherProviders = await AIProvider.find({
      isEnabled: true,
      _id: { $nin: Array.from(configuredProviderIds) }
    }).lean();

    for (const provider of otherProviders) {
      const activeKeys = provider.apiKeys
        .filter((k: any) => k.isActive && (!k.cooldownUntil || k.cooldownUntil < new Date()))
        .sort((a: any, b: any) => a.priority - b.priority);

      if (activeKeys.length === 0) { if (!includeWithoutKeys) continue; }

      const models = await AIModel.find({
        providerId: provider._id,
        isActive: true,
        ...(VISION_TASKS.includes(taskType) ? { 'capabilities.vision': true } : {})
      }).lean();

      for (const model of models) {
        for (let keyIndex = 0; keyIndex < Math.min(activeKeys.length, 2); keyIndex++) {
          const keyDoc = activeKeys[keyIndex];
          options.push({
            provider,
            model,
            apiKey: { key: decrypt(keyDoc.key), label: keyDoc.label, priority: keyDoc.priority, index: keyIndex },
            providerStrategy: 'fallback',
            modelStrategy: 'fallback',
            providerWeight: 999, // Low priority
            modelWeight: 1,
          });
        }
      }
    }
  }

  return options;
}

/**
 * Select provider order based on global strategy
 */
function selectProviderOrder(taskConfig: any, modelOptions: ModelOption[]): any[] {
  const globalStrategy = taskConfig.defaultProviderStrategy || 'fallback';

  // Group by provider
  const providerGroups = new Map<string, ModelOption[]>();
  for (const opt of modelOptions) {
    const pid = opt.provider._id.toString();
    if (!providerGroups.has(pid)) providerGroups.set(pid, []);
    providerGroups.get(pid)!.push(opt);
  }

  const providers = Array.from(providerGroups.entries()).map(([providerId, opts]) => ({
    providerId,
    providerName: opts[0].provider.name,
    strategy: opts[0].providerStrategy,
    weight: opts[0].providerWeight,
    options: opts,
  }));

  if (globalStrategy === 'round-robin') {
    // Weighted round-robin across providers
    const weighted: any[] = [];
    for (const p of providers) {
      for (let i = 0; i < p.weight; i++) weighted.push(p);
    }
    return shuffleArray(weighted);
  }

  // fallback or priority: use priority order (already sorted by weight)
  return providers.sort((a, b) => a.weight - b.weight);
}

/**
 * Select model/key order within a provider
 */
function selectModelOrder(providerConfig: any, options: ModelOption[]): ModelOption[] {
  const strategy = providerConfig.strategy;

  if (strategy === 'round-robin') {
    // Weighted round-robin
    const weighted: ModelOption[] = [];
    for (const opt of options) {
      for (let i = 0; i < (opt.modelWeight || 1); i++) {
        weighted.push(opt);
      }
    }
    return shuffleArray(weighted);
  }

  // fallback or priority: use priority order
  return options.sort((a, b) => (a.apiKey.priority || 1) - (b.apiKey.priority || 1));
}

/**
 * Build gateway config for a specific model option
 */
function buildGatewayConfig(option: ModelOption, callOptions: CallAIOptions): GatewayConfig {
  const providerDef = getProviderDefinition(option.provider.providerId);

  return {
    baseUrl: option.provider.baseUrl || providerDef?.baseUrl || '',
    apiKey: option.apiKey.key,
    model: option.model.modelId,
    temperature: callOptions.temperature,
    maxTokens: callOptions.maxTokens,
    reasoningEffort: callOptions.reasoningEffort,
    timeoutMs: callOptions.timeoutMs || option.provider.defaultTimeoutMs || providerDef?.defaultTimeoutMs || 45000,
    retries: callOptions.retries ?? option.provider.defaultRetries ?? providerDef?.defaultRetries ?? 2,
    authType: providerDef?.authType || 'bearer',
    customHeaders: option.provider.customHeaders?.reduce((acc: any, h: any) => {
      if (h?.key) acc[h.key] = h.isSecret && h.value ? decrypt(h.value) : h.value;
      return acc;
    }, {}),
  };
}

/**
 * Mark key cooldown in provider
 */
async function markKeyCooldown(provider: any, keyIndex: number, cooldownMs = 60000): Promise<void> {
  try {
    await AIProvider.findByIdAndUpdate(provider._id, {
      $set: { [`apiKeys.${keyIndex}.cooldownUntil`]: new Date(Date.now() + cooldownMs) },
      $inc: { [`apiKeys.${keyIndex}.failCount`]: 1 },
    });
    logKeyCooldown({
      providerId: provider._id.toString(),
      providerName: provider.name,
      keyLabel: provider.apiKeys[keyIndex]?.label || `Key ${keyIndex}`,
      keyId: provider.apiKeys[keyIndex]?._id?.toString() || '',
      cooldownMs,
      reason: 'Rate limit hit',
    });
  } catch (err: any) {
    console.error('[Router] Failed to mark key cooldown:', err.message);
  }
}

/**
 * Reset key cooldown
 */
export async function resetKeyCooldown(providerId: string, keyId: string): Promise<void> {
  await AIProvider.findOneAndUpdate(
    { _id: providerId, 'apiKeys._id': keyId },
    {
      $set: { 'apiKeys.$.cooldownUntil': null, 'apiKeys.$.failCount': 0 }
    }
  );
}

/**
 * Map gateway (OpenAI snake_case) usage to the log service usage shape
 */
function mapGatewayUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined,
  cost?: number
): { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number } {
  return {
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
    totalTokens: usage?.total_tokens || 0,
    costUsd: cost || 0,
  };
}

/**
 * Shuffle array (Fisher-Yates)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Compatibility wrapper for old callAIWithRetry signature
 */
export async function callAIWithRetry(
  requestId: string,
  modelName: string,
  payload: any,
  retries = 3,
  taskType: AITaskType = 'vision'
): Promise<AICallResult> {
  return callAI(requestId, taskType, payload, { modelName, retries });
}

/**
 * Get available models for a task (for admin UI)
 */
export async function getAvailableModelsForTask(taskType: AITaskType): Promise<any[]> {
  const taskConfig = await AITaskConfig.findOne({ taskType }).lean();
  if (!taskConfig) return [];

  const modelOptions = await buildModelOptions(taskConfig, taskType, true);

  // Group by provider
  const byProvider = new Map<string, any[]>();
  for (const opt of modelOptions) {
    const key = `${opt.provider.name} (${opt.provider.providerId})`;
    if (!byProvider.has(key)) byProvider.set(key, []);
    byProvider.get(key)!.push({
      modelId: opt.model.modelId,
      displayName: opt.model.displayName,
      isFreeTier: opt.model.isFreeTier,
      capabilities: opt.model.capabilities,
      keyLabel: opt.apiKey.label,
      keyPriority: opt.apiKey.priority,
    });
  }

  return Array.from(byProvider.entries()).map(([provider, models]) => ({ provider, models }));
}

/**
 * Health check for all providers
 */
export async function checkAllProvidersHealth(): Promise<any[]> {
  const providers = await AIProvider.find({ isEnabled: true }).lean();
  const results = [];

  for (const provider of providers) {
    const activeKeys = provider.apiKeys.filter((k: any) => k.isActive).length;
    const providerDef = getProviderDefinition(provider.providerId);

    let status = 'unknown';
    let modelCount = 0;
    let error = '';

    if (activeKeys === 0) {
      status = 'no_keys';
    } else {
      try {
        const models = await listModels({
          baseUrl: provider.baseUrl || providerDef?.baseUrl || '',
          apiKey: decrypt(provider.apiKeys[0].key),
          model: '',
          timeoutMs: 15000,
          retries: 0,
          authType: providerDef?.authType || 'bearer',
        });
        modelCount = models.length;
        status = modelCount > 0 ? 'healthy' : 'no_models';
      } catch (err: any) {
        status = 'error';
        error = err.message;
      }
    }

    results.push({
      providerId: provider._id.toString(),
      providerName: provider.name,
      providerType: provider.providerId,
      status,
      activeKeys,
      modelCount,
      error,
      baseUrl: provider.baseUrl || providerDef?.baseUrl,
    });
  }

  return results;
}