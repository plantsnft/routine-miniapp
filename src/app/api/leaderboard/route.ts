import { NextRequest, NextResponse } from "next/server";
import { getTopUsersByStreak } from "~/lib/supabase";
import { getNeynarClient } from "~/lib/neynar";
import type { LeaderboardEntry } from "~/lib/models";

const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"; // CATWALK on Base

/**
 * Get token balance for a wallet address on Base chain using direct RPC call.
 * More reliable than BaseScan API and doesn't require API key.
 */
async function getTokenBalance(address: string): Promise<number> {
  try {
    const rpcUrl = "https://mainnet.base.org";
    
    // ERC20 balanceOf(address) function selector: 0x70a08231
    // Pad address to 32 bytes (64 hex chars)
    const addressParam = address.slice(2).toLowerCase().padStart(64, '0');
    const balanceCall = {
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          to: TOKEN_ADDRESS,
          data: `0x70a08231${addressParam}`, // balanceOf(address)
        },
        "latest",
      ],
      id: 1,
    };

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Catwalk-MiniApp",
      },
      body: JSON.stringify(balanceCall),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      console.error(`[Leaderboard] RPC call failed for ${address}:`, response.status);
      return 0;
    }

    const data = await response.json();
    
    if (data.result && data.result !== "0x" && !data.error) {
      // Convert from hex to BigInt, then divide by 10^18 (18 decimals)
      const balanceRaw = BigInt(data.result);
      const decimals = BigInt(10 ** 18);
      const wholePart = balanceRaw / decimals;
      const fractionalPart = balanceRaw % decimals;
      
      // Convert to number with precision
      const balance = Number(wholePart) + Number(fractionalPart) / Number(decimals);
      
      return balance;
    }
    
    return 0;
  } catch (error: any) {
    if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
      console.error(`[Leaderboard] Error fetching balance for ${address}:`, error);
    }
    return 0;
  }
}

/**
 * Batch fetch token balances with rate limiting.
 * Processes addresses in chunks to avoid overwhelming the RPC endpoint.
 */
async function getTokenBalancesBatch(
  addresses: string[],
  batchSize: number = 5,
  delayBetweenBatches: number = 200
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  
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
 * Supports sorting by either $CATWALK holdings or streak (Most Walks).
 * 
 * For "holdings" mode: Includes ALL token holders (even if they haven't checked in).
 * For "streak" mode: Shows users ranked by check-in streaks (Most Walks).
 * 
 * Returns top 50 users, with their streaks and Farcaster usernames.
 * Includes ALL wallet addresses associated with each Farcaster ID:
 * - Verified addresses (external wallets connected by user)
 * - Custodial addresses (Farcaster integrated wallet, Bankr bot, etc.)
 * - Active status addresses (if available)
 * Consolidates holdings across ALL wallets per user (one combined score per FID).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sortBy = searchParams.get("sortBy") || "holdings"; // "holdings" or "streak"
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const client = getNeynarClient();
    let fids: number[] = [];
    const checkinMap = new Map<number, { streak: number; last_checkin: string | null; total_checkins: number }>();

    if (sortBy === "holdings") {
      // For holdings mode: Get ALL users who have checked in (up to 500 for broader coverage)
      // This ensures we include as many potential holders as possible
      const allCheckins = await getTopUsersByStreak(500);
      fids = allCheckins.map((c) => c.fid);
      // Create map for quick lookup but we won't require check-in for ranking
      allCheckins.forEach((c) => {
        checkinMap.set(c.fid, {
          streak: c.streak || 0,
          last_checkin: c.last_checkin || null,
          total_checkins: c.total_checkins || 0,
        });
      });
    } else {
      // For streak mode: Only get users who have checked in (for streak ranking)
      const topCheckins = await getTopUsersByStreak(200);
      fids = topCheckins.map((c) => c.fid);
      topCheckins.forEach((c) => {
        checkinMap.set(c.fid, {
          streak: c.streak || 0,
          last_checkin: c.last_checkin || null,
          total_checkins: c.total_checkins || 0,
        });
      });
    }
    
    if (fids.length === 0) {
      return NextResponse.json({
        ok: true,
        entries: [],
      });
    }

    // Fetch user data from Neynar (includes usernames and verified addresses)
    const { users } = await client.fetchBulkUsers({ fids });

    // Helper function to collect ALL addresses from a user object
    // This includes: verified addresses, custodial addresses, and any other linked addresses
    const getAllUserAddresses = (u: any): string[] => {
      const addresses: string[] = [];
      
      // Verified addresses (external wallets connected by user)
      if (u.verified_addresses?.eth_addresses) {
        addresses.push(...u.verified_addresses.eth_addresses);
      }
      
      // Custodial address (Farcaster's integrated wallet, Bankr bot, etc.)
      if (u.custodial_address) {
        addresses.push(u.custodial_address);
      }
      
      // Active status addresses (if available)
      if (u.active_status?.addresses) {
        addresses.push(...u.active_status.addresses);
      }
      
      // Remove duplicates and normalize to lowercase for consistency
      const uniqueAddresses = Array.from(new Set(addresses.map(addr => addr.toLowerCase())));
      
      return uniqueAddresses;
    };

    // Create a map of FID to user data with ALL addresses
    const userMap = new Map(
      users.map((u) => {
        const allAddresses = getAllUserAddresses(u);
        return [
          u.fid,
          {
            username: u.username,
            displayName: u.display_name,
            allAddresses: allAddresses,
          },
        ];
      })
    );

    // Collect all unique addresses to batch fetch balances
    const addressToFids = new Map<string, number[]>();
    const fidToAddresses = new Map<number, string[]>();
    
    // For holdings mode: process all users, not just check-ins
    // For streak mode: only process users who have checked in
    const usersToProcess = sortBy === "holdings" 
      ? Array.from(userMap.keys()).map((fid) => ({ fid }))
      : fids.map((fid) => ({ fid }));
    
    usersToProcess.forEach(({ fid }) => {
      const userData = userMap.get(fid);
      if (userData?.allAddresses && userData.allAddresses.length > 0) {
        fidToAddresses.set(fid, userData.allAddresses);
        userData.allAddresses.forEach((addr) => {
          const normalizedAddr = addr.toLowerCase();
          if (!addressToFids.has(normalizedAddr)) {
            addressToFids.set(normalizedAddr, []);
          }
          addressToFids.get(normalizedAddr)!.push(fid);
        });
      }
    });

    // Batch fetch all token balances at once
    // Note: Ethereum addresses are case-insensitive, but we normalize to lowercase for consistency
    const allAddresses = Array.from(addressToFids.keys());
    const balancesMap = await getTokenBalancesBatch(allAddresses);
    
    // Normalize the balances map keys to lowercase for lookup
    const normalizedBalancesMap = new Map<string, number>();
    balancesMap.forEach((balance, addr) => {
      normalizedBalancesMap.set(addr.toLowerCase(), balance);
    });

    // Build leaderboard entries with token balances
    // For holdings mode: Include ALL users with verified addresses (even if no check-in)
    // For streak mode: Only include users who have checked in
    const entriesWithBalances: LeaderboardEntry[] = [];
    
    for (const [fid, userData] of userMap.entries()) {
      const username = userData?.username;
      const displayName = userData?.displayName;
      
      // Get token balance from ALL addresses (verified, custodial, integrated, etc.)
      // Consolidate holdings across ALL wallets for this user (one combined score per FID)
      let tokenBalance = 0;
      const userAddresses = fidToAddresses.get(fid) || [];
      if (userAddresses.length > 0) {
        // Sum all balances across ALL wallets for this user
        // This includes: verified wallets, custodial wallets, integrated wallets, bot wallets, etc.
        tokenBalance = userAddresses.reduce((sum, addr) => {
          const normalizedAddr = addr.toLowerCase();
          const balance = normalizedBalancesMap.get(normalizedAddr) || 0;
          return sum + balance;
        }, 0);
      }
      
      // For holdings mode: Include users with tokens OR users who have checked in (for broader coverage)
      // For streak mode: Only include users who have checked in
      const checkinData = checkinMap.get(fid);
      if (sortBy === "holdings") {
        // Include if they have tokens OR if they have checked in (to show all potential holders)
        if (tokenBalance > 0 || checkinData) {
          entriesWithBalances.push({
            fid,
            streak: checkinData?.streak || 0,
            last_checkin: checkinData?.last_checkin || null,
            total_checkins: checkinData?.total_checkins || 0,
            username,
            displayName,
            rank: 0, // Will be set after sorting
            tokenBalance: tokenBalance,
          });
        }
      } else {
        // Streak mode: Only include users who have checked in
        if (checkinData) {
          entriesWithBalances.push({
            fid,
            streak: checkinData.streak,
            last_checkin: checkinData.last_checkin,
            total_checkins: checkinData.total_checkins || 0,
            username,
            displayName,
            rank: 0, // Will be set after sorting
            tokenBalance: tokenBalance,
          });
        }
      }
    }

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
      // Sort by token balance (descending) - most to least holdings
      // For holdings mode: Rank by balance only, don't require check-in
      entriesWithBalances.sort((a, b) => {
        const balanceA = a.tokenBalance || 0;
        const balanceB = b.tokenBalance || 0;
        
        // Primary sort: by token balance (descending)
        if (balanceB !== balanceA) {
          return balanceB - balanceA;
        }
        
        // Tiebreaker: by FID (for consistency, not by streak as requested)
        return b.fid - a.fid;
      });
    }
    
    // Log summary for debugging
    const totalHoldings = entriesWithBalances.reduce((sum, entry) => sum + (entry.tokenBalance || 0), 0);
    const usersWithHoldings = entriesWithBalances.filter(e => (e.tokenBalance || 0) > 0).length;
    console.log(`[Leaderboard] Total $CATWALK holdings: ${totalHoldings.toFixed(2)}, Users with holdings: ${usersWithHoldings}/${entriesWithBalances.length}`);

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

