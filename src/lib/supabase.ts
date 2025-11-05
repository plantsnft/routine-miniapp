/**
 * Supabase client and service layer for database operations.
 * Centralizes all Supabase API calls and provides type-safe interfaces.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Standard Supabase headers for API requests.
 */
const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
} as const;

/**
 * Check-in record interface matching Supabase schema.
 */
export interface CheckinRecord {
  id?: string;
  fid: number;
  last_checkin: string | null;
  streak: number;
  total_checkins?: number; // All-time total check-in count
  inserted_at?: string;
  updated_at?: string;
}

/**
 * Get a user's check-in record by FID.
 * 
 * @param fid - Farcaster user ID
 * @returns The check-in record or null if not found
 */
export async function getCheckinByFid(fid: number): Promise<CheckinRecord | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/checkins?fid=eq.${fid}&limit=1`,
    {
      method: "GET",
      headers: SUPABASE_HEADERS,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] Select error:", text);
    throw new Error(`Failed to fetch check-in: ${text}`);
  }

  const data = await res.json();
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Create a new check-in record.
 * 
 * @param fid - Farcaster user ID
 * @param lastCheckin - ISO timestamp of check-in
 * @param streak - Initial streak count
 * @param totalCheckins - Total check-in count (default: 1)
 * @returns The created check-in record
 */
export async function createCheckin(
  fid: number,
  lastCheckin: string,
  streak: number,
  totalCheckins: number = 1
): Promise<CheckinRecord> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/checkins`, {
    method: "POST",
    headers: {
      ...SUPABASE_HEADERS,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([
      {
        fid,
        last_checkin: lastCheckin,
        streak,
        total_checkins: totalCheckins,
      },
    ]),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] Insert error:", text);
    throw new Error(`Failed to create check-in: ${text}`);
  }

  const data = await res.json();
  return data[0];
}

/**
 * Update a user's check-in record.
 * 
 * @param fid - Farcaster user ID
 * @param updates - Fields to update
 * @returns The updated check-in record
 */
export async function updateCheckin(
  fid: number,
  updates: { last_checkin: string; streak: number; total_checkins?: number }
): Promise<CheckinRecord> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/checkins?fid=eq.${fid}`,
    {
      method: "PATCH",
      headers: SUPABASE_HEADERS,
      body: JSON.stringify(updates),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] Update error:", text);
    throw new Error(`Failed to update check-in: ${text}`);
  }

  const data = await res.json();
  return data[0];
}

/**
 * Get top users by streak for leaderboard.
 * 
 * @param limit - Number of users to return (default: 100)
 * @returns Array of check-in records sorted by streak (descending)
 */
export async function getTopUsersByStreak(limit: number = 100): Promise<CheckinRecord[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/checkins?order=streak.desc&limit=${limit}`,
    {
      method: "GET",
      headers: SUPABASE_HEADERS,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] Leaderboard query error:", text);
    throw new Error(`Failed to fetch leaderboard: ${text}`);
  }

  return await res.json();
}

