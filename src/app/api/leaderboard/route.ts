import { NextRequest, NextResponse } from "next/server";
import { getTopUsersByStreak } from "~/lib/supabase";
import { getNeynarClient } from "~/lib/neynar";
import type { LeaderboardEntry } from "~/lib/models";

const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"; // CATWALK on Base
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

/**
 * Get CATWALK token balance for a Farcaster user using Neynar API.
 * This is the preferred method as it aggregates all connected wallets automatically.
 */
async function getTokenBalanceFromNeynar(fid: number): Promise<number> {
  try {
    const client = getNeynarClient();
    
    // Log that we're attempting to fetch
    if (fid <= 5) {
      console.log(`[Leaderboard] Attempting to fetch balance from Neynar for FID ${fid}...`);
    }
    
    const response = await client.fetchUserBalance({
      fid: fid,
      networks: ['base'],
    });

    // Log response structure for first few users to debug
    if (fid <= 5) {
      console.log(`[Leaderboard] Neynar response for FID ${fid}:`, JSON.stringify(response, null, 2));
    }

    // Neynar returns balances for all tokens across all connected wallets
    // The response structure may vary, so we use type assertion to access the data
    const userBalance = response.user_balance as any;
    
    // Check for tokens array in various possible locations
    const tokens = userBalance?.tokens || userBalance?.token_balances || userBalance?.balances || [];
    
    if (fid <= 3) {
      console.log(`[Leaderboard] Found ${tokens.length} tokens for FID ${fid}`);
    }
    
    if (Array.isArray(tokens) && tokens.length > 0) {
      const catwalkToken = tokens.find(
        (token: any) => {
          const contractAddr = token.contract_address || token.contractAddress || token.address || token.token_address;
          const matches = contractAddr?.toLowerCase() === TOKEN_ADDRESS.toLowerCase();
          if (fid <= 3 && matches) {
            console.log(`[Leaderboard] Found CATWALK token for FID ${fid}:`, token);
          }
          return matches;
        }
      );
      
      if (catwalkToken) {
        // Get balance from various possible property names
        const balanceRaw = catwalkToken.balance || catwalkToken.amount || catwalkToken.value || catwalkToken.quantity || '0';
        
        if (fid <= 3) {
          console.log(`[Leaderboard] CATWALK balance raw for FID ${fid}:`, balanceRaw);
        }
        
        // Convert from wei/raw balance to human-readable format
        // The balance is typically in the smallest unit (wei for ETH, smallest unit for tokens)
        try {
          const balanceWei = BigInt(String(balanceRaw));
          const decimals = BigInt(10 ** 18); // CATWALK has 18 decimals
          const wholePart = balanceWei / decimals;
          const fractionalPart = balanceWei % decimals;
          const balance = Number(wholePart) + Number(fractionalPart) / Number(decimals);
          
          if (fid <= 3) {
            console.log(`[Leaderboard] CATWALK balance parsed for FID ${fid}:`, balance);
          }
          
          return balance;
        } catch (parseError) {
          console.error(`[Leaderboard] Error parsing balance for FID ${fid}:`, parseError, 'Raw value:', balanceRaw);
          return 0;
        }
      } else if (fid <= 3) {
        console.log(`[Leaderboard] CATWALK token not found for FID ${fid}. Available tokens:`, tokens.map((t: any) => ({
          address: t.contract_address || t.contractAddress || t.address || t.token_address,
          symbol: t.symbol || t.token_symbol,
        })));
      }
    } else if (fid <= 3) {
      console.log(`[Leaderboard] No tokens array found for FID ${fid}. User balance structure:`, Object.keys(userBalance || {}));
    }
    
    return 0;
  } catch (_error: any) {
    const error = _error as Error;
    console.error(`[Leaderboard] Error fetching balance from Neynar for FID ${fid}:`, error?.message || error);
    return 0;
  }
}

/**
 * Get token balance for a wallet address on Base chain (fallback method).
 * Uses BaseScan API (with API key if available) for better rate limits.
 * Falls back to direct RPC if BaseScan fails.
 * Includes retry logic with exponential backoff for rate limiting.
 * NOTE: Currently unused - kept as fallback if Neynar API fails
 */
async function _getTokenBalance(address: string, retries: number = 3): Promise<number> {
  // Try BaseScan API first (has better rate limits with API key)
  if (BASESCAN_API_KEY) {
    try {
      const apiKeyParam = `&apikey=${BASESCAN_API_KEY}`;
      const basescanUrl = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${TOKEN_ADDRESS}&address=${address}&tag=latest${apiKeyParam}`;
      
      const response = await fetch(basescanUrl, {
        headers: {
          "User-Agent": "Catwalk-MiniApp",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "1" && data.result) {
          // BaseScan returns balance in wei (as string)
          const balanceWei = BigInt(data.result);
          const decimals = BigInt(10 ** 18);
          const wholePart = balanceWei / decimals;
          const fractionalPart = balanceWei % decimals;
          const balance = Number(wholePart) + Number(fractionalPart) / Number(decimals);
          return balance;
        }
      } else if (response.status === 429) {
        // Rate limited, will retry with RPC fallback
        console.log(`[Leaderboard] BaseScan rate limited for ${address}, will retry with RPC`);
      }
    } catch (error) {
      // Fall through to RPC fallback
      console.log(`[Leaderboard] BaseScan API failed for ${address}, using RPC fallback`);
    }
  }

  // Fallback to direct RPC call
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

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Catwalk-MiniApp",
        },
        body: JSON.stringify(balanceCall),
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      // Handle rate limiting (429) with exponential backoff
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
        
        if (attempt < retries - 1) {
          console.log(`[Leaderboard] Rate limited for ${address}, retrying after ${waitTime}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        } else {
          console.error(`[Leaderboard] Rate limited for ${address} after ${retries} attempts`);
          return 0;
        }
      }

      if (!response.ok) {
        if (attempt < retries - 1) {
          const waitTime = Math.min(500 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
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
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        if (attempt < retries - 1) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        return 0;
      }
      
      if (attempt < retries - 1) {
        const waitTime = Math.min(500 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      console.error(`[Leaderboard] Error fetching balance for ${address}:`, error);
      return 0;
    }
  }
  
  return 0;
}

// Note: getTokenBalancesBatch removed - now using Neynar API which aggregates all wallets automatically
// The individual getTokenBalance function is kept as a fallback if needed

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
    let blockchainBalances = new Map<number, number>(); // Balances from BaseScan
    let totalTokenHolders = 0; // Total holders from blockchain

    if (sortBy === "holdings") {
      // For holdings mode: Get ALL token holders from blockchain, then match to Farcaster FIDs
      console.log("[Leaderboard] Fetching ALL token holders from BaseScan...");
      
      const addressToBalance = new Map<string, number>();
      const addressToFid = new Map<string, number>();
      let totalHolders = 0;
      
      // 1. Get all token holders from BaseScan API (paginated)
      try {
        const apiKeyParam = BASESCAN_API_KEY ? `&apikey=${BASESCAN_API_KEY}` : "";
        let page = 1;
        const pageSize = 1000; // Max per page
        let hasMore = true;
        
        while (hasMore && page <= 10) { // Limit to 10 pages (10,000 holders max) to avoid timeout
          const holderListUrl = `https://api.basescan.org/api?module=token&action=tokenholderlist&contractaddress=${TOKEN_ADDRESS}&page=${page}&offset=${pageSize}${apiKeyParam}`;
          
          const holderResponse = await fetch(holderListUrl, {
            headers: { "User-Agent": "Catwalk-MiniApp" },
          });
          
          if (holderResponse.ok) {
            const holderData = await holderResponse.json();
            if (holderData.status === "1" && holderData.result && Array.isArray(holderData.result)) {
              holderData.result.forEach((holder: any) => {
                const address = holder.TokenHolderAddress?.toLowerCase();
                const balance = parseFloat(holder.TokenHolderQuantity || "0");
                if (address && balance > 0) {
                  addressToBalance.set(address, balance);
                }
              });
              
              totalHolders = parseInt(holderData.result[0]?.TotalHolders || "0", 10) || addressToBalance.size;
              hasMore = holderData.result.length === pageSize;
              console.log(`[Leaderboard] Fetched page ${page}: ${holderData.result.length} holders (Total so far: ${addressToBalance.size})`);
              page++;
              
              // Small delay between pages
              if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } else {
              hasMore = false;
            }
          } else {
            console.error(`[Leaderboard] BaseScan API error: ${holderResponse.status}`);
            hasMore = false;
          }
        }
        
        console.log(`[Leaderboard] Total token holders found: ${totalHolders || addressToBalance.size}`);
      } catch (holderError) {
        console.error("[Leaderboard] Error fetching token holders from BaseScan:", holderError);
      }
      
      // 2. For each holder address, try to find their Farcaster FID using Neynar
      console.log(`[Leaderboard] Looking up Farcaster FIDs for ${addressToBalance.size} token holders...`);
      const addresses = Array.from(addressToBalance.keys());
      const batchSize = 10;
      
      for (let i = 0; i < Math.min(addresses.length, 500); i += batchSize) { // Limit to 500 addresses to avoid timeout
        const batch = addresses.slice(i, i + batchSize);
        
        const fidPromises = batch.map(async (address) => {
          try {
            // Use Neynar to find FID by address
            const userResponse = await client.fetchUserByAddress(address);
            if (userResponse && userResponse.length > 0) {
              const fid = userResponse[0]?.fid;
              if (fid) {
                return { address, fid };
              }
            }
          } catch (_err) {
            // Address not linked to Farcaster, skip
          }
          return null;
        });
        
        const fidResults = await Promise.all(fidPromises);
        fidResults.forEach((result) => {
          if (result) {
            addressToFid.set(result.address, result.fid);
          }
        });
        
        // Delay between batches
        if (i + batchSize < addresses.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // 3. Build FID list with balances from blockchain
      addressToFid.forEach((fid, address) => {
        const balance = addressToBalance.get(address) || 0;
        const currentBalance = blockchainBalances.get(fid) || 0;
        blockchainBalances.set(fid, currentBalance + balance); // Sum if user has multiple addresses
      });
      
      fids = Array.from(blockchainBalances.keys());
      totalTokenHolders = totalHolders || addressToBalance.size;
      console.log(`[Leaderboard] Found ${fids.length} Farcaster users among ${addressToBalance.size} token holders (Total holders: ${totalTokenHolders})`);
      
      // 4. Also get check-in data for users we found
      const allCheckins = await getTopUsersByStreak(1000);
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
    // Try to get comprehensive wallet data by using the API directly if needed
    let users: any[] = [];
    try {
      const response = await client.fetchBulkUsers({ fids });
      users = response.users || [];
    } catch (error) {
      console.error("[Leaderboard] Error fetching users from Neynar SDK:", error);
      // Fallback: Try direct API call
      try {
        const apiKey = process.env.NEYNAR_API_KEY;
        if (apiKey) {
          const fidsParam = fids.join(',');
          const apiResponse = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fidsParam}`,
            {
              headers: {
                'api_key': apiKey,
              },
            }
          );
          if (apiResponse.ok) {
            const apiData = await apiResponse.json();
            users = apiData.users || [];
            console.log(`[Leaderboard] Fetched ${users.length} users via direct API call`);
          }
        }
      } catch (apiError) {
        console.error("[Leaderboard] Direct API call also failed:", apiError);
        throw error; // Throw original error
      }
    }

    // Helper function to collect ALL addresses from a user object
    // This includes: verified addresses, custodial addresses, and any other linked addresses
    const getAllUserAddresses = (u: any, fid: number): string[] => {
      const addresses: string[] = [];
      
      // Log the user object structure for debugging (only for first few users to avoid spam)
      if (fid <= 5) {
        console.log(`[Leaderboard] User ${fid} wallet data:`, {
          verified_addresses: u.verified_addresses,
          custodial_address: u.custodial_address,
          active_status: u.active_status,
          // Check for other possible wallet fields
          wallets: (u as any).wallets,
          connected_addresses: (u as any).connected_addresses,
          eth_addresses: (u as any).eth_addresses,
        });
      }
      
      // Verified addresses (external wallets connected by user)
      // Check multiple possible structures
      if (u.verified_addresses?.eth_addresses) {
        addresses.push(...u.verified_addresses.eth_addresses);
      }
      if (u.verified_addresses?.ethAddresses) {
        addresses.push(...u.verified_addresses.ethAddresses);
      }
      if (Array.isArray(u.verified_addresses)) {
        addresses.push(...u.verified_addresses);
      }
      
      // Direct eth_addresses field (if exists)
      if (u.eth_addresses && Array.isArray(u.eth_addresses)) {
        addresses.push(...u.eth_addresses);
      }
      
      // Custodial address (Farcaster's integrated wallet, Bankr bot, etc.)
      if (u.custodial_address) {
        addresses.push(u.custodial_address);
      }
      if (u.custodialAddress) {
        addresses.push(u.custodialAddress);
      }
      
      // Active status addresses (if available)
      if (u.active_status?.addresses) {
        addresses.push(...u.active_status.addresses);
      }
      if (u.activeStatus?.addresses) {
        addresses.push(...u.activeStatus.addresses);
      }
      
      // Check for wallets array (if it exists)
      if (u.wallets && Array.isArray(u.wallets)) {
        u.wallets.forEach((wallet: any) => {
          if (wallet.address) {
            addresses.push(wallet.address);
          }
          if (wallet.eth_address) {
            addresses.push(wallet.eth_address);
          }
        });
      }
      
      // Check for connected_addresses (if it exists)
      if (u.connected_addresses && Array.isArray(u.connected_addresses)) {
        addresses.push(...u.connected_addresses);
      }
      
      // Filter out invalid addresses and normalize
      const validAddresses = addresses
        .filter((addr): addr is string => {
          if (!addr || typeof addr !== 'string') return false;
          // Basic Ethereum address validation (0x followed by 40 hex chars)
          return /^0x[a-fA-F0-9]{40}$/.test(addr);
        })
        .map(addr => addr.toLowerCase());
      
      // Remove duplicates
      const uniqueAddresses = Array.from(new Set(validAddresses));
      
      if (fid <= 5) {
        console.log(`[Leaderboard] User ${fid} extracted ${uniqueAddresses.length} unique addresses:`, uniqueAddresses);
      }
      
      return uniqueAddresses;
    };

    // Create a map of FID to user data with ALL addresses
    const userMap = new Map(
      users.map((u) => {
        const allAddresses = getAllUserAddresses(u, u.fid);
        return [
          u.fid,
          {
            username: u.username,
            displayName: u.display_name,
            pfp_url: u.pfp_url || undefined,
            allAddresses: allAddresses,
          },
        ];
      })
    );

    // Use balances from BaseScan (already fetched) or fetch from Neynar as fallback
    const fidToBalance = new Map<number, number>();
    
    if (sortBy === "holdings") {
      // Use blockchain balances we already fetched, verify/update with Neynar for accuracy
      blockchainBalances.forEach((balance, fid) => {
        fidToBalance.set(fid, balance);
      });
      
      console.log(`[Leaderboard] Using ${blockchainBalances.size} balances from BaseScan, verifying top holders with Neynar...`);
      
      // Verify top holders with Neynar (limit to top 50 to avoid timeout)
      const topFids = Array.from(blockchainBalances.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([fid]) => fid);
      
      for (const fid of topFids) {
        try {
          const neynarBalance = await getTokenBalanceFromNeynar(fid);
          // Use the higher balance (Neynar aggregates all wallets, might be more accurate)
          const blockchainBalance = blockchainBalances.get(fid) || 0;
          fidToBalance.set(fid, Math.max(neynarBalance, blockchainBalance));
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
        } catch (_err) {
          // Keep blockchain balance if Neynar fails
        }
      }
      
      console.log(`[Leaderboard] Final balances for ${fidToBalance.size} Farcaster users (Total token holders: ${totalTokenHolders})`);
    } else {
      // For streak/total_checkins mode, we don't need balances
      console.log(`[Leaderboard] Skipping balance fetch for ${sortBy} mode (not needed)`);
    }

    // Build leaderboard entries with token balances
    // For holdings mode: Include ALL users with verified addresses (even if no check-in)
    // For streak mode: Only include users who have checked in
    const entriesWithBalances: LeaderboardEntry[] = [];
    
    for (const [fid, userData] of userMap.entries()) {
      const username = userData?.username;
      const displayName = userData?.displayName;
      
      // Get token balance from Neynar API (already aggregated across all wallets)
      // For holdings mode, use Neynar balance; for other modes, use 0
      let tokenBalance = 0;
      if (sortBy === "holdings") {
        tokenBalance = fidToBalance.get(fid) || 0;
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
            pfp_url: userData?.pfp_url,
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
            pfp_url: userData?.pfp_url,
            rank: 0, // Will be set after sorting
            tokenBalance: 0, // Not needed for streak mode
          });
        }
      }
    }

    // Sort based on sortBy parameter
    if (sortBy === "streak") {
      // Sort by current streak (descending)
      entriesWithBalances.sort((a, b) => {
        const streakA = a.streak || 0;
        const streakB = b.streak || 0;
        if (streakB !== streakA) {
          return streakB - streakA;
        }
        // Tiebreaker: by total check-ins (descending)
        return (b.total_checkins || 0) - (a.total_checkins || 0);
      });
    } else if (sortBy === "total_checkins") {
      // Sort by total check-ins all time (descending)
      entriesWithBalances.sort((a, b) => {
        const totalA = a.total_checkins || 0;
        const totalB = b.total_checkins || 0;
        if (totalB !== totalA) {
          return totalB - totalA;
        }
        // Tiebreaker: by current streak (descending)
        return (b.streak || 0) - (a.streak || 0);
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
    console.log(`[Leaderboard] Summary: ${entriesWithBalances.length} entries, ${usersWithHoldings} Farcaster users with $CATWALK holdings`);
    if (sortBy === "holdings" && totalTokenHolders > 0) {
      console.log(`[Leaderboard] Total token holders (all wallets): ${totalTokenHolders}`);
    }
    console.log(`[Leaderboard] Total $CATWALK holdings (Farcaster users): ${totalHoldings.toFixed(2)}`);

    // Assign ranks and limit to top entries
    const topEntries = entriesWithBalances.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return NextResponse.json({
      ok: true,
      entries: topEntries,
      totalHolders: sortBy === "holdings" ? totalTokenHolders : undefined, // Include total holders count
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

