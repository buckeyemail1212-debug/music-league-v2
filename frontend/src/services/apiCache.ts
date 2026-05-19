// Module-scope TTL+SWR cache for API responses.
//
// Lives outside React state so it survives tab switches but is cleared on
// logout (see AuthContext). No external dependency; intentionally minimal.
//
// Cache keys should include the user id (e.g. `auth-stats:${userId}`) so a
// second user signing in on the same device can't see the previous user's
// data through a stale entry.

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

type FetchFn<T> = () => Promise<T>;

const cache = new Map<string, CacheEntry<any>>();
const DEFAULT_TTL_MS = 45 * 1000;

export const apiCache = {
  /**
   * Return cached data if still fresh (within ttlMs), otherwise null.
   */
  get<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) return null;
    return entry.data as T;
  },

  /**
   * Return cached data even if stale. Drives the synchronous first-paint
   * branch of the SWR pattern.
   */
  getStale<T>(key: string): T | null {
    const entry = cache.get(key);
    return entry ? (entry.data as T) : null;
  },

  set<T>(key: string, data: T): void {
    cache.set(key, { data, timestamp: Date.now() });
  },

  /**
   * Drop a single key, or every key starting with the given prefix when no
   * exact match exists.
   */
  invalidate(keyOrPrefix: string): void {
    if (cache.has(keyOrPrefix)) {
      cache.delete(keyOrPrefix);
      return;
    }
    for (const key of cache.keys()) {
      if (key.startsWith(keyOrPrefix)) {
        cache.delete(key);
      }
    }
  },

  clear(): void {
    cache.clear();
  },

  /**
   * Stale-while-revalidate fetch.
   *
   *   fresh cache  → returns it, no network call, onUpdate is not fired
   *   stale cache  → returns stale value, refetches in background, calls
   *                  onUpdate with the fresh value when it lands
   *   no cache     → awaits the fetcher, stores it, calls onUpdate, returns
   *                  the fresh value
   *
   * The cold-start branch fires onUpdate too (in addition to returning the
   * value) so callers that don't await still see the data via the same
   * setter they wired for the background-refetch path.
   */
  async swr<T>(
    key: string,
    fetcher: FetchFn<T>,
    onUpdate: (data: T) => void,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<T> {
    const fresh = this.get<T>(key, ttlMs);
    if (fresh !== null) {
      return fresh;
    }

    const stale = this.getStale<T>(key);
    if (stale !== null) {
      fetcher()
        .then((data) => {
          this.set(key, data);
          onUpdate(data);
        })
        .catch((err) => {
          console.warn(`[apiCache] background refetch failed for ${key}:`, err);
        });
      return stale;
    }

    const data = await fetcher();
    this.set(key, data);
    onUpdate(data);
    return data;
  },
};
