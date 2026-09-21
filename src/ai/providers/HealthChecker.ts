// Health checker cho từng model trong từng provider
class ModelHealthChecker {
  private healthCache = new Map<string, ModelHealth>();
  private lastChecks = new Map<string, Date>();
  
  async checkModelHealth(
    modelName: string,
    provider: 'gemini' | 'cline',
    apiKey: string,
    timeout: number = 10000
  ): Promise<ModelHealth> {
    const cacheKey = `${provider}:${modelName}`;
    const now = new Date();
    
    // Check cache first
    if (this.lastChecks.has(cacheKey)) {
      const lastCheck = this.lastChecks.get(cacheKey)!;
      const timeSinceCheck = now.getTime() - lastCheck.getTime();
      const cacheTimeout = 30000; // 30 giây cache
      
      if (timeSinceCheck < cacheTimeout) {
        return this.healthCache.get(cacheKey)!;
      }
    }
    
    let health: ModelHealth;
    
    try {
      const startTime = Date.now();
      
      if (provider === 'gemini') {
        health = await this.checkGeminiModelHealth(modelName, apiKey, timeout);
      } else {
        health = await this.checkClineModelHealth(modelName, apiKey, timeout);
      }
      
      const responseTime = Date.now() - startTime;
      
      // Update health với response time
      health = {
        ...health,
        responseTime,
        lastChecked: now,
        lastSuccess: health.status === 'healthy' ? now : health.lastSuccess
      };
      
    } catch (error) {
      health = this.createFailedHealth(error, now);
    }
    
    // Cache kết quả
    this.healthCache.set(cacheKey, health);
    this.lastChecks.set(cacheKey, now);
    
    return health;
  }
  
  private async checkGeminiModelHealth(
    modelName: string,
    apiKey: string,
    timeout: number
  ): Promise<ModelHealth> {
    try {
      // Thử call Gemini API với model cụ thể
      // Implementation phụ thuộc vào Gemini client
      const result = await this.callGeminiWithModel(modelName, apiKey, timeout);
      
      if (result.success) {
        return {
          status: 'healthy',
          lastSuccess: new Date(),
          lastFailure: null,
          errorType: undefined,
          errorCount: 0,
          maxFailuresBeforeFailover: 3,
          cooldownUntil: null,
          responseTime: result.responseTime,
          quotaUsed: result.quotaUsed || 0
        };
      } else {
        return this.createFailedHealth(new Error(result.error), new Date());
      }
      
    } catch (error) {
      return this.createFailedHealth(error, new Date());
    }
  }
  
  private async checkClineModelHealth(
    modelName: string,
    apiKey: string,
    timeout: number
  ): Promise<ModelHealth> {
    try {
      // Thử call Cline API với model cụ thể
      const result = await this.callClineWithModel(modelName, apiKey, timeout);
      
      if (result.success) {
        return {
          status: 'healthy',
          lastSuccess: new Date(),
          lastFailure: null,
          errorType: undefined,
          errorCount: 0,
          maxFailuresBeforeFailover: 3,
          cooldownUntil: null,
          responseTime: result.responseTime,
          quotaUsed: result.quotaUsed || 0
        };
      } else {
        return this.createFailedHealth(new Error(result.error), new Date());
      }
      
    } catch (error) {
      return this.createFailedHealth(error, new Date());
    }
  }
  
  private createFailedHealth(error: any, timestamp: Date): ModelHealth {
    const errorType = this.classifyError(error);
    const previousHealth = this.getPreviousHealthForModel(error.typeof modelName?); // Cần context
    
    const errorCount = (previousHealth?.errorCount || 0) + 1;
    const consecutiveFailures = (previousHealth?.lastSuccess ? 
      Math.floor((timestamp.getTime() - previousHealth.lastSuccess.getTime()) / 60000) : 0) + 1;
    
    // Auto-cooldown sau 3 failures
    const cooldownUntil = errorCount >= 3 ? new Date(timestamp.getTime() + 300000) : null; // 5 phút
    
    return {
      status: errorCount >= 5 ? 'unhealthy' : errorCount >= 3 ? 'degraded' : 'degraded',
      lastSuccess: previousHealth?.lastSuccess || null,
      lastFailure: timestamp,
      errorType,
      errorCount,
      maxFailuresBeforeFailover: 5,
      cooldownUntil,
      responseTime: 0,
      quotaUsed: 0
    };
  }
  
  private classifyError(error: any): 'timeout' | 'quota' | 'blocked' | 'network' | 'auth' | undefined {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('timeout') || message.includes('timeout')) return 'timeout';
    if (message.includes('quota') || message.includes('limit')) return 'quota';
    if (message.includes('blocked') || message.includes('forbidden')) return 'blocked';
    if (message.includes('network') || message.includes('connection')) return 'network';
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('invalid key')) return 'auth';
    
    return undefined;
  }
  
  // Các helper methods để call actual APIs (sẽ implement sau)
  private async callGeminiWithModel(modelName: string, apiKey: string, timeout: number): Promise<any> {
    // Implementation cho Gemini API call với model cụ thể
    throw new Error('Gemini API implementation chưa có');
  }
  
  private async callClineWithModel(modelName: string, apiKey: string, timeout: number): Promise<any> {
    // Implementation cho Cline API call với model cụ thể
    throw new Error('Cline API implementation chưa có');
  }
  
  getCachedHealth(modelName: string, provider: 'gemini' | 'cline'): ModelHealth | null {
    const cacheKey = `${provider}:${modelName}`;
    return this.healthCache.get(cacheKey) || null;
  }
}