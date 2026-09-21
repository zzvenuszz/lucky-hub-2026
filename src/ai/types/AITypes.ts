// Loạt định nghĩa loại cho model và provider management
export interface ModelInfo {
  name: string;
  provider: 'gemini' | 'cline';
  health: ModelHealth;
  lastChecked: Date;
  consecutiveFailures: number;
  responseTime: number;
  quotaUsed: number;
  available: boolean;
  metadata: ModelMetadata;
}

export interface ModelHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastSuccess: Date | null;
  lastFailure: Date | null;
  errorType?: 'timeout' | 'quota' | 'blocked' | 'network' | 'auth';
  errorCount: number;
  maxFailuresBeforeFailover: number;
  cooldownUntil: Date | null;
}

export interface ModelPool {
  provider: 'gemini' | 'cline';
  taskTypes: AITaskType[];
  selectedModels: string[];
  fallbackStrategy: 'sequential' | 'parallel' | 'health-based';
  maxRetriesPerModel: number;
  modelConfigs: Map<string, ModelConfig>;
  healthThreshold: number;
}

export interface ModelConfig {
  name: string;
  priority: number;
  timeout: number;
  maxRetries: number;
  healthCheckInterval: number;
  weight: number; // Cho health-based routing
}

export interface ProviderHealth {
  provider: 'gemini' | 'cline';
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  modelCount: number;
  healthyModels: number;
  unhealthyModels: number;
  lastCheck: Date;
  lastSuccess: Date;
  failureRate: number;
  averageResponseTime: number;
}

export interface FailoverConfig {
  // Provider failover
  providerFailover: {
    enabled: boolean;
    strategy: 'priority-based' | 'health-based' | 'geographic';
    maxConsecutiveFailures: number;
    minHealthyProviders: number;
    retryDelays: number[]; // giây
  };
  
  // Model failover
  modelFailover: {
    enabled: boolean;
    strategy: 'sequential' | 'parallel' | 'health-based';
    maxRetriesPerModel: number;
    minHealthyModels: number;
    modelTimeout: number;
    resetPoolInterval: number; // phút
  };
  
  // Health monitoring
  healthMonitoring: {
    interval: number; // giây
    timeout: number; // cho health check
    retryCount: number;
    ignoreCache: boolean;
  };
}

// Re-export commonly used types từ types.ts gốc
export type {
  AITaskType,
  Message,
  AIKnowledge,
  AIRule,
  HealthGoal,
  HealthMetric
} from '../../types.ts';