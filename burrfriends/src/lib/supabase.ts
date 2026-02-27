/**
 * Supabase client and service layer for database operations.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE } from './constants';
import type { User } from './types';

/**
 * Standard Supabase headers for API requests (anon key).
 */
const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
} as const;

/**
 * Service role headers for admin operations (server-side only).
 */
const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * Get a user by FID.
 */
export async function getUserByFid(fid: number): Promise<User | null> {
  if (!SUPABASE_URL) {
    console.error("[Supabase] getUserByFid: SUPABASE_URL not configured", {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    return null;
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?fid=eq.${fid}&limit=1`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[Supabase] getUserByFid error:", res.status, text);
      return null;
    }

    const data = await res.json();
    return data && data.length > 0 ? data[0] : null;
  } catch (error: any) {
    console.error("[Supabase] getUserByFid error:", error);
    return null;
  }
}

/**
 * Create or update a user record.
 * Uses service role for upsert to handle conflicts.
 */
export async function upsertUser(userData: {
  fid: number;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  wallet_address?: string;
}): Promise<User> {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.error("[Supabase] upsertUser: Supabase not configured", {
      hasUrl,
      hasAnonKey,
      hasServiceRole,
      urlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
      serviceRoleLength: process.env.SUPABASE_SERVICE_ROLE?.length || 0,
    });
    throw new Error("Supabase not configured");
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: "POST",
    headers: {
      ...SUPABASE_SERVICE_HEADERS,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([{
      fid: userData.fid,
      username: userData.username || null,
      display_name: userData.display_name || null,
      avatar_url: userData.avatar_url || null,
      wallet_address: userData.wallet_address || null,
      updated_at: new Date().toISOString(),
    }]),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] upsertUser error:", text);
    throw new Error(`Failed to upsert user: ${text}`);
  }

  const data = await res.json();
  return data[0];
}

/**
 * Get service role client for admin operations.
 * This should only be used in server-side code.
 */
export function getServiceRoleHeaders() {
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_SERVICE_ROLE) {
    console.error("[Supabase] getServiceRoleHeaders: SUPABASE_SERVICE_ROLE not configured", {
      hasServiceRole,
      serviceRoleLength: process.env.SUPABASE_SERVICE_ROLE?.length || 0,
    });
    throw new Error("SUPABASE_SERVICE_ROLE not configured");
  }
  return SUPABASE_SERVICE_HEADERS;
}

/**
 * Get anon headers for client-side operations.
 */
export function getAnonHeaders() {
  return SUPABASE_HEADERS;
}

/**
 * Get service role headers for poker schema operations.
 * All poker.* tables should be accessed via service role for MVP.
 */
export function getPokerServiceHeaders() {
  return getServiceRoleHeaders();
}

/**
 * Build a Supabase REST API URL for poker schema tables.
 * Example: getPokerApiUrl('clubs') => '${SUPABASE_URL}/rest/v1/poker.clubs'
 */
export function getPokerApiUrl(tableName: string): string {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL not configured');
  }
  // Use schema-qualified table name: poker.tableName
  // Supabase REST API uses dot notation for schema-qualified tables
  return `${SUPABASE_URL}/rest/v1/poker.${tableName}`;
}

/**
 * Build a Supabase REST API URL with query params for poker schema.
 */
export function getPokerApiUrlWithQuery(tableName: string, params: Record<string, string>): string {
  const baseUrl = getPokerApiUrl(tableName);
  const queryString = new URLSearchParams(params).toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}
