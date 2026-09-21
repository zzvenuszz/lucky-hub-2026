// Provider failover manager với provider-level failover logic
class ProviderFailoverManager {
  private providerHealth: Map<'gemini' | 'cline', ProviderHealth> = new Map();
  private failoverHistory: Map<'gemini' | 'cline', FailoverRecord[]> = new Map();
  private currentActiveProviders: Set<'gemini' | 'cline'> = new Set();
  
  constructor() {
    // Khởi tạo provider ban đầu
    this.currentActiveProviders.add('gemini');
    this.currentActiveProviders.add('cline');
