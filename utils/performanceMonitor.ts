/**
 * Performance Monitoring Utility
 * Tracks component render times, API call durations, and memory usage
 */

interface PerformanceMetric {
  componentName: string;
  type: 'render' | 'api' | 'computation';
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface PerformanceStats {
  avg: number;
  min: number;
  max: number;
  count: number;
  total: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private renderTimes: Map<string, number[]> = new Map();
  private apiTimes: Map<string, number[]> = new Map();
  private computationTimes: Map<string, number[]> = new Map();
  private componentStartTimes: Map<string, number> = new Map();
  private MAX_METRICS = 1000;
  private WARN_THRESHOLD = 50; // ms - warn if render > 50ms
  private API_THRESHOLD = 1000; // ms - warn if API > 1s

  /**
   * Mark component render start
   */
  public renderStart(componentName: string): void {
    this.componentStartTimes.set(`render:${componentName}`, performance.now());
  }

  /**
   * Mark component render end and record duration
   */
  public renderEnd(componentName: string, metadata?: Record<string, any>): void {
    const key = `render:${componentName}`;
    const startTime = this.componentStartTimes.get(key);
    
    if (!startTime) {
      console.warn(`[Performance] No start time for ${componentName}`);
      return;
    }

    const duration = performance.now() - startTime;
    this.recordMetric({
      componentName,
      type: 'render',
      duration,
      timestamp: Date.now(),
      metadata,
    });

    if (duration > this.WARN_THRESHOLD) {
      console.warn(`[Performance] ${componentName} render took ${duration.toFixed(2)}ms (> ${this.WARN_THRESHOLD}ms)`);
    }

    this.componentStartTimes.delete(key);

    if (!this.renderTimes.has(componentName)) {
      this.renderTimes.set(componentName, []);
    }
    this.renderTimes.get(componentName)!.push(duration);
  }

  /**
   * Track API call duration
   */
  public async trackApiCall<T>(
    endpoint: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        componentName: `API: ${endpoint}`,
        type: 'api',
        duration,
        timestamp: Date.now(),
        metadata: { ...metadata, success: true },
      });

      if (duration > this.API_THRESHOLD) {
        console.warn(`[Performance] API ${endpoint} took ${duration.toFixed(2)}ms (> ${this.API_THRESHOLD}ms)`);
      }

      if (window.debugLog) {
        window.debugLog(`[API] ${endpoint} completed in ${duration.toFixed(2)}ms`, 'system');
      }

      if (!this.apiTimes.has(endpoint)) {
        this.apiTimes.set(endpoint, []);
      }
      this.apiTimes.get(endpoint)!.push(duration);

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        componentName: `API: ${endpoint}`,
        type: 'api',
        duration,
        timestamp: Date.now(),
        metadata: { ...metadata, success: false, error: String(error) },
      });

      if (window.debugLog) {
        window.debugLog(`[API] ${endpoint} failed in ${duration.toFixed(2)}ms: ${String(error)}`, 'error');
      }

      throw error;
    }
  }

  /**
   * Track computation duration
   */
  public measureComputation(
    name: string,
    fn: () => void,
    metadata?: Record<string, any>
  ): void {
    const startTime = performance.now();
    
    try {
      fn();
    } finally {
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        componentName: `Computation: ${name}`,
        type: 'computation',
        duration,
        timestamp: Date.now(),
        metadata,
      });

      if (duration > this.WARN_THRESHOLD) {
        console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
      }

      if (!this.computationTimes.has(name)) {
        this.computationTimes.set(name, []);
      }
      this.computationTimes.get(name)!.push(duration);
    }
  }

  /**
   * Record a metric
   */
  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // Keep metrics size manageable
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-500);
    }
  }

  /**
   * Get statistics for a component
   */
  public getStats(componentName: string, type?: 'render' | 'api' | 'computation'): PerformanceStats | null {
    let times: number[] = [];

    if (type === 'render' || !type) {
      times = [...(this.renderTimes.get(componentName) || [])];
    } else if (type === 'api') {
      times = [...(this.apiTimes.get(componentName) || [])];
    } else if (type === 'computation') {
      times = [...(this.computationTimes.get(componentName) || [])];
    }

    if (times.length === 0) return null;

    return {
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      count: times.length,
      total: times.reduce((a, b) => a + b, 0),
    };
  }

  /**
   * Get all stats
   */
  public getAllStats(): Record<string, PerformanceStats> {
    const stats: Record<string, PerformanceStats> = {};

    // Render stats
    this.renderTimes.forEach((times, component) => {
      const key = `${component} (render)`;
      stats[key] = {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length,
        total: times.reduce((a, b) => a + b, 0),
      };
    });

    // API stats
    this.apiTimes.forEach((times, endpoint) => {
      const key = `${endpoint} (api)`;
      stats[key] = {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length,
        total: times.reduce((a, b) => a + b, 0),
      };
    });

    // Computation stats
    this.computationTimes.forEach((times, name) => {
      const key = `${name} (computation)`;
      stats[key] = {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length,
        total: times.reduce((a, b) => a + b, 0),
      };
    });

    return stats;
  }

  /**
   * Print performance report
   */
  public printReport(): void {
    const stats = this.getAllStats();
    
    console.group('📊 Performance Report');
    console.log(`Total metrics collected: ${this.metrics.length}`);
    console.log(`Timestamp: ${new Date().toLocaleString()}\n`);

    const sorted = Object.entries(stats)
      .sort((a, b) => b[1].avg - a[1].avg);

    console.table(
      Object.fromEntries(
        sorted.map(([key, value]) => [
          key,
          {
            'Avg (ms)': value.avg.toFixed(2),
            'Min (ms)': value.min.toFixed(2),
            'Max (ms)': value.max.toFixed(2),
            Count: value.count,
            'Total (ms)': value.total.toFixed(2),
          },
        ])
      )
    );

    console.groupEnd();
  }

  /**
   * Export metrics as JSON
   */
  public exportMetrics(): PerformanceMetric[] {
    return JSON.parse(JSON.stringify(this.metrics));
  }

  /**
   * Clear all metrics
   */
  public clear(): void {
    this.metrics = [];
    this.renderTimes.clear();
    this.apiTimes.clear();
    this.computationTimes.clear();
    this.componentStartTimes.clear();
    console.log('[Performance] Metrics cleared');
  }

  /**
   * Get memory usage estimation
   */
  public getMemoryEstimate(): string {
    const metricsSize = this.metrics.length * 200; // Approximate bytes per metric
    const mbSize = metricsSize / 1024 / 1024;
    return `${mbSize.toFixed(2)} MB`;
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).performanceMonitor = performanceMonitor;
}

export default performanceMonitor;
