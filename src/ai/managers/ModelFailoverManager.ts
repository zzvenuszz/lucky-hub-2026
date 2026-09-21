// Model failover manager với sequential/parallel failover logic
class ModelFailoverManager {
  private modelPoolManager: ModelPoolManager;
  private failoverHistory: Map<string, FailoverRecord[]> = new Map();
  
  constructor(modelPoolManager: ModelPoolManager) {
    this.modelPoolManager = modelPoolManager;
  }
  
  async callModelWithFailover(
    modelInfo: ModelInfo,
    taskType: AITaskType,
    payload: any,
    options?: {
      retries?: number;
      excludeModels?: string[];
      onFailover?: (fromModel: string, toModel: string, reason: string) => void;
    }
  ): Promise<any> {
    const requestId = Math.random().toString(36).substring(7);
    const provider = modelInfo.provider;
    
    // Lấy pool cho task type
    const poolKey = `${provider}-${taskType}`;
    const pool = this.modelPoolManager.getPoolInfo(poolKey);
    if (!pool) {
      throw new Error(`Không tìm thấy pool cho ${taskType} của ${provider}`);
    }
    
    // Sequence models để thử (bắt đầu với model được chọn)
    const modelsToTry = this.buildModelSequence(modelInfo, pool, options?.excludeModels || []);
    
    let lastError: any = null;
    
    for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
      const currentModel = modelsToTry[attempt];
      const isFirstAttempt = attempt === 0;
      
      try {
        console.log(`[ModelFailover] Thử model ${currentModel.name} (${attempt + 1}/${modelsToTry.length})`);
        
        // Gọi model với timeout và retry
        const result = await this.callModelWithRetry(
          currentModel,
          payload,
          {
            maxRetries: pool.maxRetriesPerModel,
            timeout: currentModel.metadata.timeout,
            requestId
          }
        );
        
        // Thành công - ghi nhận failover nếu không phải attempt đầu tiên
        if (!isFirstAttempt && options?.onFailover) {
          options.onFailover(modelInfo.name, currentModel.name, 'Model successfully recovered');
        }
        
        // Ghi lại thành công
        this.recordSuccess(currentModel.name, provider);
        
        return result;
        
      } catch (error) {
        lastError = error;
        console.error(`[ModelFailover] Model ${currentModel.name} thất bại:`, error.message);
        
        // Ghi nhận thất bại
        this.recordFailure(currentModel.name, provider, error);
        
        // Notify trên failover
        if (!isFirstAttempt && options?.onFailover) {
          options.onFailover(modelInfo.name, currentModel.name, error.message);
        }
        
        // Nếu đây là attempt cuối cùng, throw lỗi
        if (attempt === modelsToTry.length - 1) {
          throw new Error(`Tất cả models đều thất bại. Lỗi cuối: ${error.message}`);
        }
        
        // Cooldown model thất bại
        await this.cooldownFailedModel(currentModel, error);
        
        // Tiếp tục với model tiếp theo
        continue;
      }
    }
    
    throw lastError || new Error('Model failover failed');
  }
  
  private buildModelSequence(
    currentModel: ModelInfo,
    pool: ModelPool,
    excludeModels: string[]
  ): ModelInfo[] {
    const sequence: ModelInfo[] = [];
    const seen = new Set<string>();
    
    // Bắt đầu với model hiện tại
    sequence.push(currentModel);
    seen.add(currentModel.name);
    
    // Thêm các models còn lại theo priority
    const remainingModels = pool.selectedModels
      .filter(name => !seen.has(name) && !excludeModels.includes(name))
      .sort((a, b) => {
        const priorityA = pool.modelConfigs.get(a)?.priority || 999;
        const priorityB = pool.modelConfigs.get(b)?.priority || 999;
        return priorityA - priorityB;
      });
    
    sequence.push(...remainingModels.map(name => 
      this.modelPoolManager.getAllModelInfos().find(m => m.name === name)!
    ));
    
    return sequence;
  }
  
  private async callModelWithRetry(
    modelInfo: ModelInfo,
    payload: any,
    options: {
      maxRetries: number;
      timeout: number;
      requestId: string;
    }
  ): Promise<any> {
    let lastError: any = null;
    
    for (let retry = 0; retry <= options.maxRetries; retry++) {
      try {
        if (retry > 0) {
          console.log(`[ModelFailover] Thử lại ${modelInfo.name} (lần ${retry}/${options.maxRetries})`);
          // Exponential backoff
          await this.sleep(Math.pow(2, retry) * 1000);
        }
        
        // Call model với timeout
        const result = await this.callSingleModel(modelInfo, payload, options.timeout);
        return result;
        
      } catch (error) {
        lastError = error;
        console.error(`[ModelFailover] Model ${modelInfo.name} thất bại (thử ${retry + 1}):`, error.message);
        
        // Check nếu nên retry dựa trên error type
        if (!this.shouldRetry(error)) {
          throw error;
        }
      }
    }
    
    throw lastError;
  }
  
  private async callSingleModel(modelInfo: ModelInfo, payload: any, timeout: number): Promise<any> {
    // Implementation cho single model call
    // Có thể gọi Gemini API hoặc Cline API trực tiếp
    switch (modelInfo.provider) {
      case 'gemini':
        return this.callGeminiModel(modelInfo.name, payload, timeout);
      case 'cline':
        return this.callClineModel(modelInfo.name, payload, timeout);
      default:
        throw new Error(`Không hỗ trợ provider ${modelInfo.provider}`);
    }
  }
  
  private async callGeminiModel(modelName: string, payload: any, timeout: number): Promise<any> {
    // Implementation cho Gemini model call
    throw new Error('Gemini model call implementation chưa có');
  }
  
  private async callClineModel(modelName: string, payload: any, timeout: number): Promise<any> {
    // Implementation cho Cline model call
    throw new Error('Cline model call implementation chưa có');
  }
  
  private shouldRetry(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    
    // Retry cho timeout, network errors, quota errors
    return message.includes('timeout') || 
           message.includes('network') || 
           message.includes('quota') || 
           message.includes('temporarily');
  }
  
  private async cooldownFailedModel(modelInfo: ModelInfo, error: any): Promise<void> {
    // Tăng error count
    modelInfo.health.errorCount++;
    
    // Set cooldown nếu error count cao
    if (modelInfo.health.errorCount >= 3) {
      const cooldownUntil = new Date();
      cooldownUntil.setMinutes(cooldownUntil.getMinutes() + 5); // 5 phút cooldown
      modelInfo.health.cooldownUntil = cooldownUntil;
      
      console.log(`[ModelFailover] Model ${modelInfo.name} cooldown ${cooldownUntil.toISOString()} do ${modelInfo.health.errorCount} failures`);
    }
    
    // Đánh dấu model không available
    modelInfo.available = false;
  }
  
  private recordSuccess(modelName: string, provider: 'gemini' | 'cline'): void {
    const key = `${provider}-${modelName}`;
    const history = this.failoverHistory.get(key) || [];
    
    history.push({
      timestamp: new Date(),
      type: 'success',
      model: modelName,
      provider,
      duration: 0 // TODO: track duration
    });
    
    this.failoverHistory.set(key, history);
  }
  
  private recordFailure(modelName: string, provider: 'gemini' | 'cline', error: any): void {
    const key = `${provider}-${modelName}`;
    const history = this.failoverHistory.get(key) || [];
    
    history.push({
      timestamp: new Date(),
      type: 'failure',
      model: modelName,
      provider,
      error: error.message,
      duration: 0 // TODO: track duration
    });
    
    this.failoverHistory.set(key, history);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // API public methods
  getFailoverHistory(provider: 'gemini' | 'cline', modelName?: string): FailoverRecord[] {
    if (modelName) {
      const key = `${provider}-${modelName}`;
      return this.failoverHistory.get(key) || [];
    }
    
    return Array.from(this.failoverHistory.values()).flat();
  }
  
  getSuccessRate(provider: 'gemini' | 'cline', modelName?: string, timeWindowMinutes?: number): number {
    const history = this.getFailoverHistory(provider, modelName);
    const cutoff = timeWindowMinutes ? 
      new Date(Date.now() - timeWindowMinutes * 60 * 1000) : 
      new Date(0);
    
    const filtered = history.filter(record => record.timestamp > cutoff);
    const successes = filtered.filter(record => record.type === 'success').length;
    const total = filtered.length;
    
    return total > 0 ? successes / total : 0;
  }
}

interface FailoverRecord {
  timestamp: Date;
  type: 'success' | 'failure';
  model: string;
  provider: 'gemini' | 'cline';
  error?: string;
  duration: number;
}
