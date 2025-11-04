import { NextRequest, NextResponse } from "next/server";
import { getTopUsersByStreak } from "~/lib/supabase";
import { getNeynarClient } from "~/lib/neynar";
import type { LeaderboardEntry } from "~/lib/models";

const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"; // CATWALK on Base

/**
 * Get token balance for a wallet address on Base chain.
 * Includes retry logic and rate limit handling.
 */
async function getTokenBalance(address: string, retries: number = 2): Promise<string> {
  const apiKey = process.env.BASESCAN_API_KEY || "";
  const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${TOKEN_ADDRESS}&address=${address}&tag=latest${apiKeyParam}`;
      
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Catwalk-MiniApp",
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        // Handle rate limiting (429) with exponential backoff
        if (response.status === 429 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // For other errors, log but don't retry
        if (attempt === retries) {
          console.error(`[Leaderboard] Failed to fetch balance for ${address} after ${retries + 1} attempts:`, response.status);
        }
        return "0";
      }

      const data = await response.json();
      
      if (data.status === "1" && data.result) {
        // Token has 18 decimals, convert to readable format
        const balance = BigInt(data.result);
        const decimals = BigInt(10 ** 18);
        const wholePart = balance / decimals;
        const fractionalPart = balance % decimals;
        
        // Format fractional part, removing trailing zeros
        const fractionalStr = fractionalPart.toString().padStart(18, '0');
        const trimmedFractional = fractionalStr.replace(/0+$/, '');
        
        // Return as string
        if (trimmedFractional === '') {
          return wholePart.toString();
        }
        return `${wholePart}.${trimmedFractional}`;
      }
      
      return "0";
    } catch (error: any) {
      // Handle timeout or network errors
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        if (attempt === retries) {
          console.error(`[Leaderboard] Timeout fetching balance for ${address} after ${retries + 1} attempts`);
        } else {
          // Retry on timeout
          continue;
        }
      } else if (attempt === retries) {
        console.error(`[Leaderboard] Error fetching balance for ${address} after ${retries + 1} attempts:`, error);
      }
      return "0";
    }
  }
  
  return "0";
}

/**
 * Batch fetch token balances with rate limiting.
 * Processes addresses in chunks to avoid overwhelming the API.
 */
async function getTokenBalancesBatch(
  addresses: string[],
  batchSize: number = 10,
  delayBetweenBatches: number = 100
): Promise<Map<string, string>> {
  const balances = new Map<string, string>();
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    
    // Fetch all balances in the batch in parallel
    const batchPromises = batch.map(async (addr) => {
      const balance = await getTokenBalance(addr);
      return { address: addr, balance };
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Store results
    batchResults.forEach(({ address, balance }) => {
      balances.set(address, balance);
    });
    
    // Small delay between batches to respect rate limits
    if (i + batchSize < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return balances;
}

/**
 * GET endpoint to fetch leaderboard data.
 * Supports sorting by either $CATWALK holdings or streak.
 * Returns top 50 users, with their streaks and Farcaster usernames.
 * Only includes users who have verified wallet addresses in Farcaster.
 * Consolidates holdings across multiple verified wallets per user.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sortBy = searchParams.get("sortBy") || "holdings"; // "holdings" or "streak"
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Get a larger pool of users (up to 200) to ensure we have enough data
    const topCheckins = await getTopUsersByStreak(200);
    
    if (topCheckins.length === 0) {
      return NextResponse.json({
        ok: true,
        entries: [],
      });
    }

    // Extract FIDs
    const fids = topCheckins.map((c) => c.fid);

    // Fetch user data from Neynar (includes usernames and verified addresses)
    const client = getNeynarClient();
    const { users } = await client.fetchBulkUsers({ fids });

    // Create a map of FID to user data
    const userMap = new Map(
      users.map((u) => [
        u.fid,
        {
          username: u.username,
          displayName: u.display_name,
          verifiedAddresses: u.verified_addresses?.eth_addresses || [],
        },
      ])
    );

    // Collect all unique addresses to batch fetch balances
    const addressToFids = new Map<string, number[]>();
    const fidToAddresses = new Map<number, string[]>();
    
    topCheckins.forEach((checkin) => {
      const userData = userMap.get(checkin.fid);
      if (userData?.verifiedAddresses && userData.verifiedAddresses.length > 0) {
        fidToAddresses.set(checkin.fid, userData.verifiedAddresses);
        userData.verifiedAddresses.forEach((addr) => {
          if (!addressToFids.has(addr)) {
            addressToFids.set(addr, []);
          }
          addressToFids.get(addr)!.push(checkin.fid);
        });
      }
    });

    // Batch fetch all token balances at once
    const allAddresses = Array.from(addressToFids.keys());
    const balancesMap = await getTokenBalancesBatch(allAddresses);

    // Build leaderboard entries with token balances
    const entriesWithBalances: LeaderboardEntry[] = topCheckins.map((checkin) => {
      const userData = userMap.get(checkin.fid);
      const username = userData?.username;
      const displayName = userData?.displayName;
      
      // Get token balance from verified addresses (if any)
      // Consolidate holdings across all verified wallets for this user
      let tokenBalance = 0;
      const userAddresses = fidToAddresses.get(checkin.fid) || [];
      if (userAddresses.length > 0) {
        // Sum all balances across multiple wallets for this user
        tokenBalance = userAddresses.reduce((sum, addr) => {
          const balance = balancesMap.get(addr) || "0";
          return sum + parseFloat(balance);
        }, 0);
      }

      return {
        fid: checkin.fid,
        streak: checkin.streak,
        last_checkin: checkin.last_checkin,
        username,
        displayName,
        rank: 0, // Will be set after sorting
        tokenBalance: tokenBalance,
      };
    });

    // Sort based on sortBy parameter
    if (sortBy === "streak") {
      // Sort by streak (descending), then by token balance as tiebreaker
      entriesWithBalances.sort((a, b) => {
        if (b.streak !== a.streak) {
          return (b.streak || 0) - (a.streak || 0);
        }
        return (b.tokenBalance || 0) - (a.tokenBalance || 0);
      });
    } else {
      // Sort by token balance (descending), then by streak as tiebreaker
      entriesWithBalances.sort((a, b) => {
        if (b.tokenBalance !== a.tokenBalance) {
          return (b.tokenBalance || 0) - (a.tokenBalance || 0);
        }
        return (b.streak || 0) - (a.streak || 0);
      });
    }

    // Assign ranks and limit to top entries
    const topEntries = entriesWithBalances.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return NextResponse.json({
      ok: true,
      entries: topEntries,
    });
  } catch (err: any) {
    console.error("[API] /api/leaderboard error:", err);
    
    // Provide more specific error messages
    let errorMessage = "Failed to load leaderboard. Please try again later.";
    if (err?.message?.includes("timeout") || err?.message?.includes("Timeout")) {
      errorMessage = "Request timed out. The leaderboard is taking longer than expected. Please try again.";
    } else if (err?.message?.includes("rate limit") || err?.message?.includes("429")) {
      errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
    }
    
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}

