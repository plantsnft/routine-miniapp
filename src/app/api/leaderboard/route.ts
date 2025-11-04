import { NextRequest, NextResponse } from "next/server";
import { getTopUsersByStreak } from "~/lib/supabase";
import { getNeynarClient } from "~/lib/neynar";
import type { LeaderboardEntry } from "~/lib/models";

const TOKEN_ADDRESS = "0xa5eb1cad0dfc1c4f8d4f84f995aeda9a7a047b07"; // CATWALK on Base

/**
 * Get token balance for a wallet address on Base chain.
 */
async function getTokenBalance(address: string): Promise<string> {
  try {
    // Use BaseScan API to get token balance
    const apiKey = process.env.BASESCAN_API_KEY || "";
    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";
    
    const url = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${TOKEN_ADDRESS}&address=${address}&tag=latest${apiKeyParam}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    if (!response.ok) {
      console.error(`[Leaderboard] Failed to fetch balance for ${address}:`, response.status);
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
  } catch (error) {
    console.error(`[Leaderboard] Error fetching balance for ${address}:`, error);
    return "0";
  }
}

/**
 * GET endpoint to fetch leaderboard data.
 * Returns top 50 users by $CATWALK holdings, with their streaks and Farcaster usernames.
 * Only includes users who have verified wallet addresses in Farcaster.
 * Consolidates holdings across multiple verified wallets per user.
 */
export async function GET(_req: NextRequest) {
  try {
    // Get a larger pool of users (up to 200) to ensure we find top holders
    // We'll sort by holdings, not streak, so we need a good pool
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

    // Build leaderboard entries with token balances
    const entriesWithBalances: LeaderboardEntry[] = await Promise.all(
      topCheckins.map(async (checkin) => {
        const userData = userMap.get(checkin.fid);
        const username = userData?.username;
        const displayName = userData?.displayName;
        
        // Get token balance from verified addresses (if any)
        // Consolidate holdings across all verified wallets for this user
        let tokenBalance = 0;
        if (userData?.verifiedAddresses && userData.verifiedAddresses.length > 0) {
          // Check all verified addresses and sum their balances
          const balances = await Promise.all(
            userData.verifiedAddresses.map((addr) => getTokenBalance(addr))
          );
          // Sum all balances across multiple wallets for this user
          tokenBalance = balances.reduce((sum, bal) => {
            return sum + parseFloat(bal || "0");
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
      })
    );

    // Sort by token balance (descending), then by streak as tiebreaker
    entriesWithBalances.sort((a, b) => {
      if (b.tokenBalance !== a.tokenBalance) {
        return (b.tokenBalance || 0) - (a.tokenBalance || 0);
      }
      return (b.streak || 0) - (a.streak || 0);
    });

    // Assign ranks and limit to top 50
    const topEntries = entriesWithBalances.slice(0, 50).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return NextResponse.json({
      ok: true,
      entries: topEntries,
    });
  } catch (err: any) {
    console.error("[API] /api/leaderboard error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

