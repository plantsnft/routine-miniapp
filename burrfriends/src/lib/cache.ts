/**
 * Simple in-memory cache with TTL.
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.1, §3.9):
 * Used for short-lived caching of Neynar responses to reduce API calls.
 * 
 * NOTE: On Vercel serverless, each instance has its own cache.
 * Cache hits only help when the same instance serves repeated requests.
 * For cross-instance caching, use Redis or a shared store.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const caches = new Map<string, Map<string, CacheEntry<any>>>();

/**
 * Get or create a named cache namespace.
 */
function getCache(namespace: string): Map<string, CacheEntry<any>> {
  let cache = caches.get(namespace);
  if (!cache) {
    cache = new Map();
    caches.set(namespace, cache);
  }
  return cache;
}

/**
 * Get a value from cache if present and not expired.
 */
export function cacheGet<T>(namespace: string, key: string): T | undefined {
  const cache = getCache(namespace);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/**
 * Set a value in cache with TTL in milliseconds.
 */
export function cacheSet<T>(namespace: string, key: string, value: T, ttlMs: number): void {
  const cache = getCache(namespace);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  
  // Simple cleanup: if cache grows large, remove expired entries
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) {
        cache.delete(k);
      }
    }
  }
}

/**
 * Delete a value from cache.
 */
export function cacheDelete(namespace: string, key: string): void {
  const cache = getCache(namespace);
  cache.delete(key);
}

/**
 * Clear all entries in a namespace.
 */
export function cacheClear(namespace: string): void {
  const cache = caches.get(namespace);
  if (cache) {
    cache.clear();
  }
}

// Cache namespaces (exported for consistency)
export const CACHE_NS = {
  AUTH_PROFILE: 'auth-profile',      // FID -> { username, pfpUrl }
  BURR_CASTS: 'burr-casts',          // 'latest' -> casts response
  WALLET_ADDRESSES: 'wallet-addr',   // FID -> addresses[]
  FID_PROFILES: 'fid-profiles',      // FID -> { username, display_name, pfp_url } - shared across chat/history/etc
} as const;

// Default TTLs in milliseconds
export const CACHE_TTL = {
  AUTH_PROFILE: 10 * 60 * 1000,      // 10 minutes
  BURR_CASTS: 10 * 60 * 1000,        // 10 minutes
  WALLET_ADDRESSES: 10 * 60 * 1000,  // 10 minutes
  FID_PROFILES: 15 * 60 * 1000,      // 15 minutes
} as const;

/**
 * Profile data shape used across the app
 */
export interface CachedProfileData {
  username?: string;
  display_name?: string;
  pfp_url?: string;
}

/**
 * Get profiles from cache for given FIDs.
 * Returns a map of FID -> profile for cache hits, and array of FIDs that need fetching.
 */
export function getProfilesFromCache(fids: number[]): {
  cached: Record<number, CachedProfileData>;
  needFetch: number[];
} {
  const cached: Record<number, CachedProfileData> = {};
  const needFetch: number[] = [];
  
  for (const fid of fids) {
    const profile = cacheGet<CachedProfileData>(CACHE_NS.FID_PROFILES, String(fid));
    if (profile) {
      cached[fid] = profile;
    } else {
      needFetch.push(fid);
    }
  }
  
  return { cached, needFetch };
}

/**
 * Store profiles in cache.
 */
export function setProfilesInCache(profiles: Record<number, CachedProfileData>): void {
  for (const [fid, profile] of Object.entries(profiles)) {
    cacheSet(CACHE_NS.FID_PROFILES, fid, profile, CACHE_TTL.FID_PROFILES);
  }
}
