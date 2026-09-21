// Quản lý model pools với health checking và failover tự động
class ModelPoolManager {
  private healthChecker = new ModelHealthChecker();
  private modelPools: Map<string, ModelPool> = new Map();
  private modelInfoMap: Map<string, ModelInfo> = new Map();
  private poolRefreshIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  constructor() {
    console.log('[ModelPoolManager] Initialized');
  }
  
  // Đăng ký model pool
  registerPool(pool: ModelPool): void {
    const poolKey = `${pool.provider}-${pool.taskTypes.join(',')}`;
    this.modelPools.set(poolKey, pool);
    
    // Khởi tạo model info cho từng model
    pool.selectedModels.forEach(modelName => {
      const modelInfo: ModelInfo = {
        name: modelName,
        provider: pool.provider,
        health: {
          status: 'unknown',
          lastSuccess: null,
          lastFailure: null,
          errorType: undefined,
          errorCount: 0,
          maxFailuresBeforeFailover: pool.maxRetriesPerModel,
          cooldownUntil: null,
          responseTime: 0,
          quotaUsed: 0
        },
        lastChecked: new Date(),
        consecutiveFailures: 0,
        available: true,
        metadata: {
          priority: pool.modelConfigs.get(modelName)?.priority || 999,
          timeout: pool.modelConfigs.get(modelName)?.timeout || 30000,
          maxRetries: pool.modelConfigs.get(modelName)?.maxRetries || 2,
          weight: pool.modelConfigs.get(modelName)?.weight || 1.0
        }
      };
      
      this.modelInfoMap.set(`${pool.provider}:${modelName}`, modelInfo);
    });
    
    // Setup periodic health checking
    this.setupHealthChecking(poolKey, pool);
    
    console.log(`[ModelPoolManager] Registered pool ${poolKey} với ${pool.selectedModels.length} models`);
  }
  
  // Chọn model cho task type cụ thể
  async selectModel(
    taskType: AITaskType,
    provider: 'gemini' | 'cline',
    options?: {
      forceModel?: string;
      excludeModels?: string[];
      healthThreshold?: number;
    }
  ): Promise<ModelInfo | null> {
    const poolKey = `${provider}-${taskType}`;
    const pool = this.modelPools.get(poolKey);
    
    if (!pool) {
      console.warn(`[ModelPoolManager] Không tìm thấy pool cho ${taskType} của ${provider}`);
      return null;
    }
    
    // Nếu forceModel được chỉ định, kiểm tra health
    if (options?.forceModel) {
      const modelInfo = this.modelInfoMap.get(`${provider}:${options.forceModel}`);
      if (modelInfo && this.isModelAvailable(modelInfo, options.healthThreshold || pool.healthThreshold)) {
        return modelInfo;
      }
    }
    
    // Chọn model dựa trên strategy
    switch (pool.fallbackStrategy) {
      case 'sequential':
        return this.selectSequentialModel(pool, options?.excludeModels || []);
      case 'parallel':
        return this.selectParallelModel(pool, options?.excludeModels || []);
      case 'health-based':
        return this.selectHealthBasedModel(pool, options?.excludeModels || [], options.healthThreshold || pool.healthThreshold);
      default:
        return this.selectSequentialModel(pool, options?.excludeModels || []);
    }
  }
  
  // Thử từng model theo thứ tự cho đến khi thành công
  private async selectSequentialModel(
    pool: ModelPool,
    excludeModels: string[]
  ): Promise<ModelInfo | null> {
    // Sắp xếp models theo priority
    const sortedModels = [...pool.selectedModels].sort((a, b) => {
      const priorityA = pool.modelConfigs.get(a)?.priority || 999;
      const priorityB = pool.modelConfigs.get(b)?.priority || 999;
      return priorityA - priorityB;
    });
    
    for (const modelName of sortedModels) {
      if (excludeModels.includes(modelName)) continue;
      
      const modelInfo = this.modelInfoMap.get(`${pool.provider}:${modelName}`);
      if (!modelInfo) continue;
      
      if (this.isModelAvailable(modelInfo, pool.healthThreshold)) {
        // Check cooldown
        if (modelInfo.health.cooldownUntil && new Date(modelInfo.health.cooldownUntil) > new Date()) {
          console.log(`[ModelPoolManager] Model ${modelName} đang cooldown đến ${modelInfo.health.cooldownUntil}`);
          continue;
        }
        
        // Refresh health trước khi chọn
        await this.refreshModelHealth(modelInfo);
        
        if (this.isModelAvailable(modelInfo, pool.healthThreshold)) {
          return modelInfo;
        }
      }
    }
// Thử models parallel (health-based)
  private async selectParallelModel(
    pool: ModelPool,
    excludeModels: string[]
  ): Promise<ModelInfo | null> {
    const availableModels: ModelInfo[] = [];
    
    for (const modelName of pool.selectedModels) {
      if (excludeModels.includes(modelName)) continue;
      
      const modelInfo = this.modelInfoMap.get(`${pool.provider}:${modelName}`);
      if (!modelInfo) continue;
      
      await this.refreshModelHealth(modelInfo);
      
      if (this.isModelAvailable(modelInfo, pool.healthThreshold)) {
        availableModels.push(modelInfo);
      }
    }
    
    if (availableModels.length === 0) return null;
    
    // Chọn model healthy nhất
    availableModels.sort((a, b) => {
      const healthScoreA = this.calculateHealthScore(a.health);
      const healthScoreB = this.calculateHealthScore(b.health);
      return healthScoreB - healthScoreA;
    });
    
    return availableModels[0];
  }
  
  // Chọn model dựa trên health score
  private async selectHealthBasedModel(
    pool: ModelPool,
    excludeModels: string[],
    healthThreshold: number
  ): Promise<ModelInfo | null> {
    const availableModels: ModelInfo[] = [];
    
    for (const modelName of pool.selectedModels) {
      if (excludeModels.includes(modelName)) continue;
      
      const modelInfo = this.modelInfoMap.get(`${pool.provider}:${modelName}`);
      if (!modelInfo) continue;
      
      await this.refreshModelHealth(modelInfo);
      
      if (this.isModelAvailable(modelInfo, healthThreshold)) {
        availableModels.push(modelInfo);
      }
    }
    
    if (availableModels.length === 0) return null;
    
    // Tính toán weight dựa trên health và priority
    availableModels.sort((a, b) => {
      const scoreA = this.calculateWeightedScore(a, pool);
      const scoreB = this.calculateWeightedScore(b, pool);
      return scoreB - scoreA;
    });
    
    return availableModels[0];
  }
  
  // Refresh health cho model cụ thể
  private async refreshModelHealth(modelInfo: ModelInfo): Promise<void> {
    const apiKey = await this.getApiKeyForModel(modelInfo.provider, modelInfo.name);
    if (!apiKey) return;
    
    const modelConfig = modelInfo.metadata;
    const health = await this.healthChecker.checkModelHealth(
      modelInfo.name,
      modelInfo.provider,
      apiKey,
      modelConfig.timeout
    );
    
    // Update model info
    modelInfo.health = health;
    modelInfo.lastChecked = new Date();
    modelInfo.available = this.isModelAvailable(modelInfo);
    
    // Log health change
    if (health.status !== 'healthy' && modelInfo.health.lastSuccess) {
      console.log(`[ModelPoolManager] Model ${modelInfo.name} (${modelInfo.provider}) status changed: ${modelInfo.health.status}`);
    }
  }
  
  // Helper methods
  private isModelAvailable(modelInfo: ModelInfo, threshold: number = 0.7): boolean {
    if (!modelInfo.available) return false;
    
    if (modelInfo.health.status === 'healthy') return true;
    if (modelInfo.health.status === 'unknown') return true; // Assume available khi chưa biết
    
    const healthScore = this.calculateHealthScore(modelInfo.health);
    return healthScore >= threshold && 
           (!modelInfo.health.cooldownUntil || new Date(modelInfo.health.cooldownUntil) <= new Date());
  }
  
  private calculateHealthScore(health: ModelHealth): number {
    switch (health.status) {
      case 'healthy': return 1.0;
      case 'degraded': return Math.max(0, 1.0 - (health.errorCount * 0.2));
      case 'unhealthy': return 0.0;
      case 'unknown': return 0.5;
      default: return 0.5;
    }
  }
  
  private calculateWeightedScore(modelInfo: ModelInfo, pool: ModelPool): number {
    const healthScore = this.calculateHealthScore(modelInfo.health);
    const metadata = modelInfo.metadata;
    
    // Tính toán score dựa trên health * weight * priority inverse
    const priorityScore = 1.0 / (metadata.priority || 1);
    const weightScore = metadata.weight || 1.0;
    
    return healthScore * weightScore * priorityScore;
  }
  
  private async getApiKeyForModel(provider: 'gemini' | 'cline', modelName: string): Promise<string | null> {
    // Implementation để lấy API key cho model cụ thể
    // Có thể từ environment variables hoặc GeminiKey collection
    return provider === 'gemini' ? process.env.GEMINI_API_KEY || null : process.env.CLINE_API_KEY || null;
  }
  
  private setupHealthChecking(poolKey: string, pool: ModelPool): void {
    const interval = setInterval(async () => {
      try {
        await this.refreshAllModelsInPool(pool);
      } catch (error) {
        console.error(`[ModelPoolManager] Lỗi health check cho pool ${poolKey}:`, error);
      }
    }, pool.modelConfigs.get(pool.selectedModels[0])?.healthCheckInterval || 60000);
    
    this.poolRefreshIntervals.set(poolKey, interval);
  }
  
  private async refreshAllModelsInPool(pool: ModelPool): Promise<void> {
    for (const modelName of pool.selectedModels) {
      const modelInfo = this.modelInfoMap.get(`${pool.provider}:${modelName}`);
      if (modelInfo) {
        await this.refreshModelHealth(modelInfo);
      }
    }
  }
  
  // API public methods
  getPoolInfo(poolKey: string): ModelPool | null {
    return this.modelPools.get(poolKey) || null;
  }
  
  getAllModelInfos(): ModelInfo[] {
    return Array.from(this.modelInfoMap.values());
  }
  
  getHealthyModelsCount(provider: 'gemini' | 'cline'): number {
    return this.modelInfoMap.values().filter(info => 
      info.provider === provider && info.available && info.health.status === 'healthy'
    ).length;
  }
  
  cleanup(): void {
    // Dọn dẹp intervals
    for (const interval of this.poolRefreshIntervals.values()) {
      clearInterval(interval);
    }
    this.poolRefreshIntervals.clear();
    console.log('[ModelPoolManager] Cleanup completed');
  }
}
    
// Thử models parallel (health-based)
  private async selectParallelModel(
    pool: ModelPool,
    excludeModels: string[]
  ): Promise<ModelInfo | null> {
    const availableModels: ModelInfo[] = [];
    
    for (const modelName of pool.selectedModels) {
      if (excludeModels.includes(modelName)) continue;
      
      const modelInfo = this.modelInfoMap.get(`${pool.provider}:${modelName}`);
      if (!modelInfo) continue;
      
      await this.refreshModelHealth(modelInfo);
      
      if (this.isModelAvailable(modelInfo, pool.healthThreshold)) {
        availableModels.push(modelInfo);
      }
    }
    
    if (availableModels.length === 0) return null;
    
    // Chọn model healthy nhất
    availableModels.sort((a, b) => {
      const healthScoreA = this.calculateHealthScore(a.health);
      const healthScoreB = this.calculateHealthScore(b.health);
      return healthScoreB - healthScoreA;
    });
    
    return availableModels[0];
  }
  
  // Chọn model dựa trên health score
  private async selectHealthBasedModel(
    pool: ModelPool,
    excludeModels: string[],
    healthThreshold: number
  ): Promise<ModelInfo | null> {
    const availableModels: ModelInfo[] = [];
    
    for (const modelName of pool.selectedModels) {
      if (excludeModels.includes(modelName)) continue;
      
      const modelInfo = this.modelInfoMap.get(`${pool.provider}:${modelName}`);
      if (!modelInfo) continue;
      
      await this.refreshModelHealth(modelInfo);
      
      if (this.isModelAvailable(modelInfo, healthThreshold)) {
        availableModels.push(modelInfo);
      }
    }
    
    if (availableModels.length === 0) return null;
    
    // Tính toán weight dựa trên health và priority
    availableModels.sort((a, b) => {
      const scoreA = this.calculateWeightedScore(a, pool);
      const scoreB = this.calculateWeightedScore(b, pool);
      return scoreB - scoreA;
    });
    
    return availableModels[0];
  }
  
  // Refresh health cho model cụ thể
  private async refreshModelHealth(modelInfo: ModelInfo): Promise<void> {
    const apiKey = await this.getApiKeyForModel(modelInfo.provider, modelInfo.name);
    if (!apiKey) return;
    
    const modelConfig = modelInfo.metadata;
    const health = await this.healthChecker.checkModelHealth(
      modelInfo.name,
      modelInfo.provider,
      apiKey,
      modelConfig.timeout
    );
    
    // Update model info
    modelInfo.health = health;
    modelInfo.lastChecked = new Date();
    modelInfo.available = this.isModelAvailable(modelInfo);
    
    // Log health change
    if (health.status !== 'healthy' && modelInfo.health.lastSuccess) {
      console.log(`[ModelPoolManager] Model ${modelInfo.name} (${modelInfo.provider}) status changed: ${modelInfo.health.status}`);
    }
  }
  
  // Helper methods
  private isModelAvailable(modelInfo: ModelInfo, threshold: number = 0.7): boolean {
    if (!modelInfo.available) return false;
    
    if (modelInfo.health.status === 'healthy') return true;
    if (modelInfo.health.status === 'unknown') return true; // Assume available khi chưa biết
    
    const healthScore = this.calculateHealthScore(modelInfo.health);
    return healthScore >= threshold && 
           (!modelInfo.health.cooldownUntil || new Date(modelInfo.health.cooldownUntil) <= new Date());
  }
  
  private calculateHealthScore(health: ModelHealth): number {
    switch (health.status) {
      case 'healthy': return 1.0;
      case 'degraded': return Math.max(0, 1.0 - (health.errorCount * 0.2));
      case 'unhealthy': return 0.0;
      case 'unknown': return 0.5;
      default: return 0.5;
    }
  }
  
  private calculateWeightedScore(modelInfo: ModelInfo, pool: ModelPool): number {
    const healthScore = this.calculateHealthScore(modelInfo.health);
    const metadata = modelInfo.metadata;
    
    // Tính toán score dựa trên health * weight * priority inverse
    const priorityScore = 1.0 / (metadata.priority || 1);
    const weightScore = metadata.weight || 1.0;
    
    return healthScore * weightScore * priorityScore;
  }
  
  private async getApiKeyForModel(provider: 'gemini' | 'cline', modelName: string): Promise<string | null> {
    // Implementation để lấy API key cho model cụ thể
    // Có thể từ environment variables hoặc GeminiKey collection
    return provider === 'gemini' ? process.env.GEMINI_API_KEY || null : process.env.CLINE_API_KEY || null;
  }
  
  private setupHealthChecking(poolKey: string, pool: ModelPool): void {
    const interval = setInterval(async () => {
      try {
        await this.refreshAllModelsInPool(pool);
      } catch (error) {
        console.error(`[ModelPoolManager] Lỗi health check cho pool ${poolKey}:`, error);
      }
    }, pool.modelConfigs.get(pool.selectedModels[0])?.healthCheckInterval || 60000);
    
    this.poolRefreshIntervals.set(poolKey, interval);
  }
  
  private async refreshAllModelsInPool(pool: ModelPool): Promise<void> {
    for (const modelName of pool.selectedModels) {
      const modelInfo = this.modelInfoMap.get(`${pool.provider}:${modelName}`);
      if (modelInfo) {
        await this.refreshModelHealth(modelInfo);
      }
    }
  }
  
  // API public methods
  getPoolInfo(poolKey: string): ModelPool | null {
    return this.modelPools.get(poolKey) || null;
  }
  
  getAllModelInfos(): ModelInfo[] {
    return Array.from(this.modelInfoMap.values());
  }
  
  getHealthyModelsCount(provider: 'gemini' | 'cline'): number {
    return this.modelInfoMap.values().filter(info => 
      info.provider === provider && info.available && info.health.status === 'healthy'
    ).length;
  }
  
  cleanup(): void {
    // Dọn dẹp intervals
    for (const interval of this.poolRefreshIntervals.values()) {
      clearInterval(interval);
    }
    this.poolRefreshIntervals.clear();
    console.log('[ModelPoolManager] Cleanup completed');
  }
}
    return null;
  }