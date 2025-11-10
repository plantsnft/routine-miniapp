/**
 * Supabase client and service layer for database operations.
 * Centralizes all Supabase API calls and provides type-safe interfaces.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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
  reward_claimed_at?: string | null; // When the daily reward was last claimed
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
  // Validate Supabase URL is configured
  if (!SUPABASE_URL) {
    console.error("[Supabase] SUPABASE_URL not configured");
    // Return null instead of throwing to allow graceful degradation
    return null;
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/checkins?fid=eq.${fid}&limit=1`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
        // Add timeout
        signal: AbortSignal.timeout(8000), // 8 second timeout
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[Supabase] Select error:", res.status, text);
      // Don't throw - return null to allow graceful degradation
      return null;
    }

    const data = await res.json();
    return data && data.length > 0 ? data[0] : null;
  } catch (error: any) {
    console.error("[Supabase] getCheckinByFid error:", error);
    // Return null instead of throwing to allow graceful degradation
    return null;
  }
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
  updates: { last_checkin: string; streak: number; total_checkins?: number; reward_claimed_at?: string | null },
  options?: { recordId?: string | null }
): Promise<CheckinRecord> {
  // Build update object, only including fields that are provided
  const updateData: Record<string, any> = {
    last_checkin: updates.last_checkin,
    streak: updates.streak,
  };
  
  if (updates.total_checkins !== undefined) {
    updateData.total_checkins = updates.total_checkins;
  }
  
  if (updates.reward_claimed_at !== undefined) {
    updateData.reward_claimed_at = updates.reward_claimed_at;
  }
  
  let filterParam: string;

  if (options?.recordId) {
    filterParam = `id=eq.${options.recordId}`;
  } else {
    const existing = await getCheckinByFid(fid);
    filterParam = existing?.id ? `id=eq.${existing.id}` : `fid=eq.${fid}`;
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/checkins?${filterParam}`,
    {
      method: "PATCH",
      headers: {
        ...SUPABASE_HEADERS,
        Prefer: "return=representation",
      },
      body: JSON.stringify(updateData),
    }
  );

  // Read response text once (can only be read once)
  const text = await res.text();

  if (!res.ok) {
    console.error("[Supabase] Update error:", res.status, text);
    throw new Error(`Failed to update check-in: ${text || `HTTP ${res.status}`}`);
  }

  // If response is empty, fetch the updated record
  if (!text || text.trim() === "") {
    const updated = await getCheckinByFid(fid);
    if (!updated) {
      throw new Error("Failed to update check-in: Record not found after update");
    }
    return updated;
  }

  // Try to parse JSON response
  try {
    const data = JSON.parse(text);
    if (data && Array.isArray(data) && data.length > 0) {
      return data[0];
    }
    // If response is not an array or is empty, fetch the updated record
    const updated = await getCheckinByFid(fid);
    if (!updated) {
      throw new Error("Failed to update check-in: Record not found after update");
    }
    return updated;
  } catch (parseError: any) {
    console.error("[Supabase] JSON parse error in updateCheckin:", parseError, "Response text:", text.substring(0, 200));
    // Fallback: fetch the updated record
    const updated = await getCheckinByFid(fid);
    if (!updated) {
      throw new Error(`Failed to update check-in: ${parseError.message}`);
    }
    return updated;
  }
}

/**
 * Mark a check-in record's reward as claimed without modifying other fields.
 */
export async function markRewardClaimed(
  fid: number,
  rewardClaimedAt: string,
  options?: { recordId?: string | null }
): Promise<CheckinRecord> {
  let filterParam: string;

  if (options?.recordId) {
    filterParam = `id=eq.${options.recordId}`;
  } else {
    const existing = await getCheckinByFid(fid);
    if (!existing) {
      throw new Error(`Check-in record not found for fid ${fid}`);
    }
    filterParam = existing.id ? `id=eq.${existing.id}` : `fid=eq.${fid}`;
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/checkins?${filterParam}`,
    {
      method: "PATCH",
      headers: {
        ...SUPABASE_HEADERS,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ reward_claimed_at: rewardClaimedAt }),
    }
  );

  const text = await res.text();

  if (!res.ok) {
    console.error("[Supabase] markRewardClaimed error:", res.status, text);
    throw new Error(`Failed to mark reward as claimed: ${text || `HTTP ${res.status}`}`);
  }

  if (!text || text.trim() === "") {
    const updated = await getCheckinByFid(fid);
    if (!updated) {
      throw new Error("Failed to mark reward as claimed: Record not found after update");
    }
    return updated;
  }

  try {
    const data = JSON.parse(text);
    if (data && Array.isArray(data) && data.length > 0) {
      return data[0];
    }
    const updated = await getCheckinByFid(fid);
    if (!updated) {
      throw new Error("Failed to mark reward as claimed: Record not found after update");
    }
    return updated;
  } catch (parseError: any) {
    console.error("[Supabase] JSON parse error in markRewardClaimed:", parseError, "Response text:", text.substring(0, 200));
    const updated = await getCheckinByFid(fid);
    if (!updated) {
      throw new Error(`Failed to mark reward as claimed: ${parseError.message}`);
    }
    return updated;
  }
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

/**
 * Price history record interface matching Supabase schema.
 */
export interface PriceHistoryRecord {
  id?: string;
  token_address: string;
  price: number;
  price_usd: number;
  market_cap?: number | null;
  volume_24h?: number | null;
  timestamp: string;
  inserted_at?: string;
}

/**
 * Store a price snapshot in the database.
 * 
 * @param tokenAddress - Token contract address
 * @param price - Current token price
 * @param priceUsd - Price in USD
 * @param marketCap - Market cap (optional)
 * @param volume24h - 24h volume (optional)
 * @returns The created price history record
 */
export async function storePriceSnapshot(
  tokenAddress: string,
  price: number,
  priceUsd: number,
  marketCap?: number | null,
  volume24h?: number | null
): Promise<PriceHistoryRecord> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/price_history`, {
    method: "POST",
    headers: {
      ...SUPABASE_HEADERS,
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      {
        token_address: tokenAddress.toLowerCase(),
        price,
        price_usd: priceUsd,
        market_cap: marketCap || null,
        volume_24h: volume24h || null,
        timestamp: new Date().toISOString(),
      },
    ]),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] Price snapshot insert error:", text);
    // Don't throw - price tracking is non-critical
    throw new Error(`Failed to store price snapshot: ${text}`);
  }

  const data = await res.json();
  return data[0];
}

/**
 * Get the most recent price snapshot for a token.
 * 
 * @param tokenAddress - Token contract address
 * @returns Most recent price history record, or null if not found
 */
export async function getLatestPriceSnapshot(tokenAddress: string): Promise<PriceHistoryRecord | null> {
  const tokenAddressLower = tokenAddress.toLowerCase();
  
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/price_history?token_address=eq.${tokenAddressLower}&order=timestamp.desc&limit=1`,
    {
      method: "GET",
      headers: SUPABASE_HEADERS,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] Latest price snapshot query error:", text);
    return null;
  }

  const data = await res.json();
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Get price from 24 hours ago for calculating 24h change.
 * 
 * @param tokenAddress - Token contract address
 * @returns Price history record from ~24h ago, or null if not found
 */
export async function getPrice24hAgo(tokenAddress: string): Promise<PriceHistoryRecord | null> {
  const tokenAddressLower = tokenAddress.toLowerCase();
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourBuffer = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h ago for buffer
  
  // Get the closest price record to 24h ago (within 1 hour window)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/price_history?token_address=eq.${tokenAddressLower}&timestamp=gte.${oneHourBuffer.toISOString()}&timestamp=lt.${twentyFourHoursAgo.toISOString()}&order=timestamp.desc&limit=1`,
    {
      method: "GET",
      headers: SUPABASE_HEADERS,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] Price history query error:", text);
    return null;
  }

  const data = await res.json();
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Calculate 24h price change percentage from stored data.
 * 
 * @param currentPrice - Current price in USD
 * @param price24hAgo - Price from 24h ago in USD
 * @returns Percentage change (positive for increase, negative for decrease)
 */
export function calculate24hChangePercent(currentPrice: number, price24hAgo: number): number {
  if (price24hAgo === 0 || !isFinite(price24hAgo)) {
    return 0;
  }
  return ((currentPrice - price24hAgo) / price24hAgo) * 100;
}

/**
 * Clean up old price history records (keep only last 7 days).
 * This should be called periodically via a cron job or edge function.
 */
export async function cleanupOldPriceHistory(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/price_history?timestamp=lt.${sevenDaysAgo.toISOString()}`,
    {
      method: "DELETE",
      headers: SUPABASE_HEADERS,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[Supabase] Price history cleanup error:", text);
  }
}

