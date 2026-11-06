/**
 * Lightweight in-process LRU cache.
 * Used to cache expensive DB reads (nearby providers, stats, plans)
 * so concurrent users hit memory instead of PostgreSQL.
 *
 * No external dependencies — just a Map with TTL.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class LruCache {
  private map = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | undefined {
    const entry = this.map.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // LRU: re-insert to move to end
    this.map.delete(key);
    this.map.set(key, entry as CacheEntry<unknown>);
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.map.size >= this.maxSize) {
      // Evict oldest entry
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value: value as unknown, expiresAt: Date.now() + ttlMs });
  }

  del(key: string): void {
    this.map.delete(key);
  }

  /** Delete all keys that start with the given prefix. */
  delByPrefix(prefix: string): void {
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }

  flush(): void {
    this.map.clear();
  }

  entries(): IterableIterator<[string, CacheEntry<unknown>]> {
    return this.map.entries();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Singleton cache instance shared across all requests. */
export const appCache = new LruCache(1000);

// Automatically purge expired cache entries every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of appCache.entries()) {
    if (now > entry.expiresAt) {
      appCache.del(key);
    }
  }
}, 30_000).unref();

/** TTL constants (milliseconds) */
export const TTL = {
  /** Hot public data — nearby providers, map pins */
  SHORT: 15_000,       // 15 s
  /** Semi-static data — provider details, plans */
  MEDIUM: 60_000,      // 60 s
  /** Rarely changes — admin stats overview */
  LONG: 5 * 60_000,    // 5 min
} as const;

/**
 * Wrap an async loader with cache.
 *   const data = await cached('nearby:lat:lng', TTL.SHORT, () => db.query(...));
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = appCache.get<T>(key);
  if (hit !== undefined) return hit;
  const result = await loader();
  appCache.set(key, result, ttlMs);
  return result;
}

