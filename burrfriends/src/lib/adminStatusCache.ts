/**
 * Client-side cache for /api/admin/status.
 *
 * Goal: deduplicate calls across multiple client components (e.g. layout bar + games page)
 * without changing auth/provider behavior or other pages.
 */

type CacheEntry = {
  value: boolean;
  expiresAt: number;
  inFlight?: Promise<boolean>;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

async function fetchIsAdmin(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/status', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    return !!(res.ok && data?.ok && data?.data?.isAdmin === true);
  } catch {
    return false;
  }
}

export async function getIsAdminCached(token: string | null): Promise<boolean> {
  if (!token) return false;
  const now = Date.now();
  const existing = cache.get(token);

  if (existing?.inFlight) return existing.inFlight;
  if (existing && existing.expiresAt > now) return existing.value;

  const inFlight = fetchIsAdmin(token).then((v) => {
    cache.set(token, { value: v, expiresAt: Date.now() + CACHE_TTL_MS });
    return v;
  });

  cache.set(token, {
    value: existing?.value ?? false,
    expiresAt: now + CACHE_TTL_MS,
    inFlight,
  });

  return inFlight;
}

