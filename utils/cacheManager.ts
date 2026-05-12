/**
 * Simple Cache Layer with TTL
 * Stores data in localStorage with automatic expiration
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

class CacheManager {
  private prefix = 'lucky_hub_cache_';
  
  /**
   * Set cache with TTL
   */
  public set<T>(key: string, data: T, ttlMinutes: number = 5): void {
    try {
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttlMinutes * 60 * 1000,
      };
      localStorage.setItem(
        this.prefix + key,
        JSON.stringify(cacheItem)
      );
    } catch (error) {
      console.warn(`[Cache] Failed to set cache for ${key}:`, error);
    }
  }

  /**
   * Get cache if not expired
   */
  public get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (!item) return null;

      const cacheItem: CacheItem<T> = JSON.parse(item);
      const now = Date.now();
      const isExpired = now - cacheItem.timestamp > cacheItem.ttl;

      if (isExpired) {
        this.remove(key);
        return null;
      }

      return cacheItem.data;
    } catch (error) {
      console.warn(`[Cache] Failed to get cache for ${key}:`, error);
      return null;
    }
  }

  /**
   * Check if cache exists and not expired
   */
  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Remove specific cache
   */
  public remove(key: string): void {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.warn(`[Cache] Failed to remove cache for ${key}:`, error);
    }
  }

  /**
   * Clear all cache with prefix
   */
  public clear(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
      console.log('[Cache] All cache cleared');
    } catch (error) {
      console.warn('[Cache] Failed to clear cache:', error);
    }
  }

  /**
   * Get cache stats
   */
  public getStats(): { totalItems: number; approxSize: string } {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(k => k.startsWith(this.prefix));
    
    let totalSize = 0;
    cacheKeys.forEach(key => {
      const item = localStorage.getItem(key);
      if (item) totalSize += item.length;
    });

    return {
      totalItems: cacheKeys.length,
      approxSize: `${(totalSize / 1024).toFixed(2)} KB`,
    };
  }
}

export const cacheManager = new CacheManager();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).cacheManager = cacheManager;
}

export default cacheManager;
