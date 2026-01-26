/**
 * Centralized Basketball Database Access
 *
 * SAFETY RAIL: Only allows access to a fixed allowlist of basketball tables.
 * Uses PostgREST schema headers to target the "basketball" schema.
 */

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from './constants';

const VALID_BASKETBALL_TABLES = new Set([
  'profiles',
  'teams',
  'players',
  'season_state',
  'gameplans',
  'offday_actions',
  'team_season_stats',
  'player_season_stats',
  'games',
  'game_player_lines',
] as const);

type BasketballTableName = (typeof VALID_BASKETBALL_TABLES extends Set<infer T> ? T : never);

function validateTableName(tableName: string): asserts tableName is BasketballTableName {
  if (!VALID_BASKETBALL_TABLES.has(tableName as any)) {
    const error = `[SAFETY RAIL] Invalid table name: "${tableName}". Must be one of: ${Array.from(
      VALID_BASKETBALL_TABLES
    ).join(', ')}`;
    throw new Error(error);
  }
}

function getServiceHeaders() {
  if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE not configured');

  return {
    apikey: SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
    'Content-Type': 'application/json',
    // PostgREST schema selection - CRITICAL for isolation
    'Accept-Profile': 'basketball',
    'Content-Profile': 'basketball',
  } as const;
}

/**
 * Build PostgREST URL for a table.
 * IMPORTANT: Do NOT use "basketball.<table>" in URL. Schema is selected via headers.
 */
function buildBasketballUrl(tableName: BasketballTableName, query?: string): string {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL not configured');

  const base = SUPABASE_URL.replace(/\/$/, '');
  const baseUrl = `${base}/rest/v1/${tableName}`;
  return query ? `${baseUrl}?${query}` : baseUrl;
}

export const basketballDb = {
  async fetch<T = any>(
    tableName: string,
    options: {
      select?: string;
      filters?: Record<string, string | number | boolean>;
      order?: string;
      limit?: number;
    } = {}
  ): Promise<T[]> {
    validateTableName(tableName);

    const params = new URLSearchParams();
    if (options.select) params.append('select', options.select);
    if (options.order) params.append('order', options.order);
    if (options.limit) params.append('limit', String(options.limit));

    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        // Handle boolean values for PostgREST (convert to "true"/"false" strings)
        const filterValue = typeof value === 'boolean' ? String(value) : String(value);
        params.append(key, `eq.${filterValue}`);
      }
    }

    const url = buildBasketballUrl(tableName, params.toString());
    const res = await fetch(url, { method: 'GET', headers: getServiceHeaders() });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch from basketball.${tableName}: ${res.status} ${text}`);
    }

    return res.json();
  },

  async insert<TInsert extends Record<string, any> = any, TReturn = TInsert>(
    tableName: BasketballTableName,
    data: TInsert | TInsert[],
    select?: string
  ): Promise<TReturn[]> {
    validateTableName(tableName);

    const records = Array.isArray(data) ? data : [data];
    const queryParams = select ? `select=${encodeURIComponent(select)}` : undefined;
    const url = buildBasketballUrl(tableName, queryParams);

    const res = await fetch(url, {
      method: 'POST',
      headers: { ...getServiceHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(records),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to insert into basketball.${tableName}: ${res.status} ${text}`);
    }

    const result = await res.json();
    // Explicitly type as array to avoid never[] inference issues
    return (Array.isArray(result) ? result : [result]) as unknown as TReturn[];
  },

  async upsert<T = any>(tableName: string, data: T | T[]): Promise<T[]> {
    validateTableName(tableName);

    const records = Array.isArray(data) ? data : [data];
    const url = buildBasketballUrl(tableName);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...getServiceHeaders(),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(records),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to upsert into basketball.${tableName}: ${res.status} ${text}`);
    }

    return res.json();
  },

  async update<T = any>(
    tableName: string,
    filters: Record<string, string | number | boolean>,
    data: Partial<T>
  ): Promise<T[]> {
    validateTableName(tableName);

    const params = new URLSearchParams();
    params.append('select', '*');
    for (const [key, value] of Object.entries(filters)) {
      const filterValue = typeof value === 'boolean' ? String(value) : String(value);
      params.append(key, `eq.${filterValue}`);
    }

    const url = buildBasketballUrl(tableName, params.toString());
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...getServiceHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to update basketball.${tableName}: ${res.status} ${text}`);
    }

    // Handle empty response (204 No Content) - can happen even with Prefer header
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return []; // Return empty array for consistency with return type
    }

    const text = await res.text();
    if (!text || text.trim() === '') {
      return []; // Empty body, return empty array
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      // If JSON parsing fails on empty response, return empty array (success case)
      return [];
    }
  },

  async delete(tableName: string, filters: Record<string, string | number | boolean>): Promise<void> {
    validateTableName(tableName);

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      const filterValue = typeof value === 'boolean' ? String(value) : String(value);
      params.append(key, `eq.${filterValue}`);
    }

    const url = buildBasketballUrl(tableName, params.toString());
    const res = await fetch(url, { method: 'DELETE', headers: getServiceHeaders() });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to delete from basketball.${tableName}: ${res.status} ${text}`);
    }
  },
};
