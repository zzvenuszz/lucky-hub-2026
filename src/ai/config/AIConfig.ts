// Configuration trung tâm cho model và provider failover
export const failoverConfig: FailoverConfig = {
  // Provider failover configuration
  providerFailover: {
    enabled: true,
    strategy: 'priority-based', // 'priority-based' | 'health-based' | 'geographic'
    maxConsecutiveFailures: 3,
    minHealthyProviders: 1,
    retryDelays: [1000, 2000, 5000], // 1s, 2s, 5s exponential backoff
  },
  
  // Model failover configuration  
  modelFailover: {
    enabled: true,
    strategy: 'sequential', // 'sequential' | 'parallel' | 'health-based'
    maxRetriesPerModel: 2,
    minHealthyModels: 1,
    modelTimeout: 30000, // 30 giây
    resetPoolInterval: 5, // 5 phút
  },
  
  // Health monitoring configuration
  healthMonitoring: {
    interval: 30, // 30 giây
    timeout: 10000, // 10 giây cho health check
    retryCount: 2,
    ignoreCache: false,
  },
};

// Provider thông tin cấu hình model đã chọn
export const providerModelPools: Record<'gemini' | 'cline', ModelPool[]> = {
  gemini: [
    {
      provider: 'gemini',
      taskTypes: ['chat', 'coach', 'meal-plan'],
      selectedModels: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'],
      fallbackStrategy: 'sequential',
      maxRetriesPerModel: 2,
      healthThreshold: 0.8,
      modelConfigs: new Map([
        ['gemini-2.0-flash', { name: 'gemini-2.0-flash', priority: 1, timeout: 30000, maxRetries: 2, healthCheckInterval: 60, weight: 1.0 }],
        ['gemini-1.5-flash', { name: 'gemini-1.5-flash', priority: 2, timeout: 30000, maxRetries: 2, healthCheckInterval: 60, weight: 0.9 }],
        ['gemini-1.5-flash-latest', { name: 'gemini-1.5-flash-latest', priority: 3, timeout: 30000, maxRetries: 2, healthCheckInterval: 60, weight: 0.8 }]
      ])
    },
    {
      provider: 'gemini',
      taskTypes: ['vision', 'verify', 'food'],
      selectedModels: ['gemini-1.5-flash', 'gemini-2.0-flash'],
      fallbackStrategy: 'sequential',
      maxRetriesPerModel: 1,
      healthThreshold: 0.7,
      modelConfigs: new Map([
        ['gemini-1.5-flash', { name: 'gemini-1.5-flash', priority: 1, timeout: 45000, maxRetries: 1, healthCheckInterval: 90, weight: 1.0 }],
        ['gemini-2.0-flash', { name: 'gemini-2.0-flash', priority: 2, timeout: 45000, maxRetries: 1, healthCheckInterval: 90, weight: 0.9 }]
      ])
    }
  ],
  
  cline: [
    {
      provider: 'cline',
      taskTypes: ['chat', 'coach', 'meal-plan'],
      selectedModels: ['deepseek/deepseek-chat', 'deepseek/deepseek-v3'],
      fallbackStrategy: 'sequential',
      maxRetriesPerModel: 2,
      healthThreshold: 0.8,
      modelConfigs: new Map([
        ['deepseek/deepseek-chat', { name: 'deepseek/deepseek-chat', priority: 1, timeout: 30000, maxRetries: 2, healthCheckInterval: 60, weight: 1.0 }],
        ['deepseek/deepseek-v3', { name: 'deepseek/deepseek-v3', priority: 2, timeout: 30000, maxRetries: 2, healthCheckInterval: 60, weight: 0.9 }]
      ])
    },
    {
      provider: 'cline',
      taskTypes: ['vision', 'verify', 'food'],
      selectedModels: ['google/gemini-2.5-flash'],
      fallbackStrategy: 'sequential',
      maxRetriesPerModel: 1,
      healthThreshold: 0.7,
      modelConfigs: new Map([
        ['google/gemini-2.5-flash', { name: 'google/gemini-2.5-flash', priority: 1, timeout: 45000, maxRetries: 1, healthCheckInterval: 90, weight: 1.0 }]
      ])
    }
  ]
};