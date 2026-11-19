/**
 * AI Services Barrel Export
 * Unified entry point for all AI services
 */

// Models
export { AIProvider } from '../../models/AIProvider.ts';
export { AIModel } from '../../models/AIModel.ts';
export { AITaskConfig } from '../../models/AITaskConfig.ts';
export { AILog } from '../../models/AILog.ts';

// Types
export type { AIProviderDoc, APIKeyDoc } from '../../models/AIProvider.ts';
export type { AIModelDoc } from '../../models/AIModel.ts';
export type { AITaskConfigDoc, ProviderPriorityDoc, ModelPriorityDoc } from '../../models/AITaskConfig.ts';
export type { AILogDoc } from '../../models/AILog.ts';

// Config
export {
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
  getAllProviderDefinitions,
  getVisionProviders,
  getFreeTierProviders,
  isFreeTierModel,
  isVisionModel,
  detectCapabilities,
  formatModelName,
  getAuthHeaderType,
  type ProviderId,
  type ProviderDefinition,
} from '../../config/aiProviders.ts';

// Services
export {
  discoverModelsForProvider,
  discoverModelsForAllProviders,
  getCachedModels,
  refreshProviderModels,
  checkModelAvailability,
  getModelInfo,
} from './modelDiscovery.ts';

export {
  logAIRequest,
  getLogs,
  getLogStats,
  getDebugModeStatus,
  setDebugModeStatus,
  cleanLogs,
  getRecentErrors,
  logFallback,
  logRateLimit,
  logKeyCooldown,
  setDebugMode,
  getDebugMode,
} from './logService.ts';

// Encryption
export { encrypt, decrypt, maskApiKey, generateEncryptionKey } from '../../utils/encryption.ts';

// Chat Context Service
export {
  getUserChatContext,
  searchRelevantKnowledge,
  getBaseKnowledge,
  buildChatSystemContext,
  type UserChatContext,
} from '../chatContextService.ts';

// Router
export {
  callAI,
  callAIEmbeddings,
  callAIWithRetry,
  getAvailableModelsForTask,
  checkAllProvidersHealth,
  resetKeyCooldown,
} from './oaiRouter.ts';
export type { AITaskType, AICallResult, AIEmbeddingResult, CallAIOptions } from './oaiRouter.ts';

// Gateway
export {
  callGateway,
  callEmbeddingGateway,
  listModels,
  convertGeminiPayload,
  type GatewayConfig,
  type GatewayMessage,
  type GatewayResult,
  type GatewayEmbeddingResult,
  type GatewayError
} from './providerGateway.ts';
