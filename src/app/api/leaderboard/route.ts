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
    console.log(`[Leaderboard] Attempting to fetch balance from Neynar for FID ${fid}...`);
    
    const response = await client.fetchUserBalance({
      fid: fid,
      networks: ['base'],
    });

    // Neynar returns balances for all tokens across all connected wallets
    // The response structure: user_balance.address_balances[].token_balances[]
    const userBalance = response.user_balance as any;
    
    // Extract all tokens from all address balances
    const addressBalances = userBalance?.address_balances || [];
    let totalBalance = 0;
    let foundCatwalk = false;
    const allTokens: any[] = [];
    
    // Iterate through all address balances and sum up CATWALK tokens
    for (const addressBalance of addressBalances) {
      const tokenBalances = addressBalance?.token_balances || [];
      const address = addressBalance?.verified_address?.address || 'unknown';
      
      for (const tokenBalance of tokenBalances) {
        const token = tokenBalance?.token;
        if (!token) continue;
        
        const contractAddr = token.contract_address || token.contractAddress || token.address;
        const symbol = token.symbol || 'unknown';
        
        // Collect all tokens for debugging
        allTokens.push({ address: contractAddr, symbol, balance: tokenBalance.balance?.in_token });
        
        // Check if this is CATWALK token
        if (contractAddr?.toLowerCase() === TOKEN_ADDRESS.toLowerCase()) {
          // Balance is already in human-readable format in balance.in_token
          const balance = tokenBalance.balance?.in_token || tokenBalance.balance || 0;
          const balanceNum = typeof balance === 'number' ? balance : parseFloat(String(balance)) || 0;
          
          if (balanceNum > 0) {
            totalBalance += balanceNum;
            foundCatwalk = true;
            console.log(`[Leaderboard] ✅ Found CATWALK for FID ${fid} at ${address}: ${balanceNum.toLocaleString()} CATWALK`);
          }
        }
      }
    }
    
    if (foundCatwalk) {
      console.log(`[Leaderboard] ✅ Total CATWALK balance for FID ${fid}: ${totalBalance.toLocaleString()}`);
      return totalBalance;
    } else {
      // Check ALL tokens for CATWALK (not just first 15) - the issue might be we're missing it
      const catwalkMatches = allTokens.filter(t => {
        const addr = t.address?.toLowerCase();
        const target = TOKEN_ADDRESS.toLowerCase();
        return addr === target;
      });
      
      if (catwalkMatches.length > 0) {
        // Found CATWALK in the list but our parsing didn't catch it - this is a bug!
        console.error(`[Leaderboard] 🐛 BUG: CATWALK found in token list for FID ${fid} but not parsed! Matches:`, catwalkMatches);
        // Try to parse it now
        for (const match of catwalkMatches) {
          const balance = match.balance;
          const balanceNum = typeof balance === 'number' ? balance : parseFloat(String(balance)) || 0;
          if (balanceNum > 0) {
            totalBalance += balanceNum;
            foundCatwalk = true;
            console.log(`[Leaderboard] ✅ Fixed: Found CATWALK for FID ${fid}: ${balanceNum.toLocaleString()} CATWALK`);
          }
        }
        if (foundCatwalk) {
          console.log(`[Leaderboard] ✅ Total CATWALK balance for FID ${fid}: ${totalBalance.toLocaleString()}`);
          return totalBalance;
        }
      }
      
      console.log(`[Leaderboard] ❌ CATWALK not found for FID ${fid}. Total addresses: ${addressBalances.length}, Total tokens: ${allTokens.length}`);
      
      if (allTokens.length > 0) {
        // Log first few and last few tokens to see the range
        const sampleSize = Math.min(10, allTokens.length);
        const tokenList = allTokens.slice(0, sampleSize).map(t => {
          const addr = t.address ? `${t.address.substring(0, 12)}...` : 'undefined';
          return `${t.symbol}@${addr}`;
        }).join(', ');
        console.log(`[Leaderboard] Sample tokens (first ${sampleSize}) for FID ${fid}:`, tokenList);
        
        // Check remaining tokens for CATWALK
        if (allTokens.length > sampleSize) {
          const remaining = allTokens.slice(sampleSize);
          const catwalkInRemaining = remaining.some(t => t.address?.toLowerCase() === TOKEN_ADDRESS.toLowerCase());
          console.log(`[Leaderboard] Remaining ${remaining.length} tokens checked for CATWALK: ${catwalkInRemaining ? 'FOUND' : 'not found'}`);
        }
      }
      
      // Also check if TOKEN_ADDRESS matches
      console.log(`[Leaderboard] Looking for token address: ${TOKEN_ADDRESS.toLowerCase()}`);
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
    } catch (_error) {
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
    const blockchainBalances = new Map<number, number>(); // Balances from BaseScan
    let totalTokenHolders = 0; // Total holders from blockchain

    if (sortBy === "holdings") {
      // TEMPORARY: Return empty entries for "Coming Soon" placeholder
      // TODO: Implement proper token holder fetching once API/data source is ready
      return NextResponse.json({
        ok: true,
        entries: [],
        totalHolders: 0,
      });
      
      // FLOW: Get ALL token holders from blockchain → Match to Farcaster FIDs → Show only Farcaster users
      console.log("[Leaderboard] Step 1: Fetching ALL token holders from blockchain...");
      
      const addressToBalance = new Map<string, number>();
      const addressToFid = new Map<string, number>();
      let totalHolders = 0;
      
      // Step 1: Get all token holders from blockchain
      // BaseScan V1 is deprecated, so we'll use Transfer events to build the holder list
      try {
        if (!BASESCAN_API_KEY) {
          console.log("[Leaderboard] ⚠️ BASESCAN_API_KEY not set. Will use Neynar fallback for known users only.");
        } else {
          console.log(`[Leaderboard] Building holder list from Transfer events (BaseScan V1 tokenholderlist is deprecated)...`);
          
          // Method: Query Transfer events to build a map of current balances
          // ERC20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
          // Topic0: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
          const transferEventTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
          
          // Method 1: Try to get holder count from token info (for display purposes)
          try {
            const tokenInfoUrl = `https://api.basescan.org/api?module=token&action=tokeninfo&contractaddress=${TOKEN_ADDRESS}&apikey=${BASESCAN_API_KEY}`;
            const tokenInfoResponse = await fetch(tokenInfoUrl, {
              headers: { "User-Agent": "Catwalk-MiniApp" },
            });
            
            if (tokenInfoResponse.ok) {
              const tokenInfo = await tokenInfoResponse.json();
              if (tokenInfo.status === "1" && tokenInfo.result && tokenInfo.result.length > 0) {
                const holderCount = parseInt(tokenInfo.result[0].holders || "0", 10);
                if (holderCount > 0) {
                  totalHolders = holderCount;
                  console.log(`[Leaderboard] Token info shows ${totalHolders} total holders`);
                }
              }
            }
          } catch (_infoError) {
            // Continue
          }
          
          // Method 2: Query Transfer events in chunks to build holder list
          // This is more reliable than the deprecated tokenholderlist endpoint
          const addressesWithBalance = new Map<string, number>();
          
          // Query Transfer events in chunks (BaseScan limits to 10,000 results per query)
          // We'll query recent blocks first (last 100,000 blocks = ~14 days on Base)
          try {
            // First, get the latest block number
            const latestBlockUrl = `https://api.basescan.org/api?module=proxy&action=eth_blockNumber&apikey=${BASESCAN_API_KEY}`;
            const latestBlockResponse = await fetch(latestBlockUrl, {
              headers: { "User-Agent": "Catwalk-MiniApp" },
            });
            
            let latestBlock = 0;
            if (latestBlockResponse.ok) {
              const latestBlockData = await latestBlockResponse.json();
              if (latestBlockData.result) {
                latestBlock = parseInt(latestBlockData.result, 16);
                console.log(`[Leaderboard] Latest block: ${latestBlock}`);
              }
            }
            
            // Query Transfer events in chunks of 10,000 blocks
            const chunkSize = 10000;
            let processedEvents = 0;
            const maxChunks = 20; // Limit to 200,000 blocks to avoid timeout
            
            for (let chunk = 0; chunk < maxChunks; chunk++) {
              const fromBlock = latestBlock - (chunk + 1) * chunkSize;
              const toBlock = latestBlock - chunk * chunkSize;
              
              if (fromBlock < 0) break;
              
              const logsUrl = `https://api.basescan.org/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${TOKEN_ADDRESS}&topic0=${transferEventTopic}&apikey=${BASESCAN_API_KEY}`;
              
              console.log(`[Leaderboard] Querying Transfer events: blocks ${fromBlock} to ${toBlock}...`);
              const logsResponse = await fetch(logsUrl, {
                headers: { "User-Agent": "Catwalk-MiniApp" },
              });
              
              if (logsResponse.ok) {
                const logsData = await logsResponse.json();
                
                if (logsData.status === "1" && logsData.result && Array.isArray(logsData.result)) {
                  const eventsInChunk = logsData.result.length;
                  processedEvents += eventsInChunk;
                  
                  // Process each transfer event
                  logsData.result.forEach((log: any) => {
                    if (log.topics && log.topics.length >= 3) {
                      const fromAddress = "0x" + log.topics[1].slice(-40).toLowerCase();
                      const toAddress = "0x" + log.topics[2].slice(-40).toLowerCase();
                      const valueHex = log.data || "0x0";
                      
                      try {
                        const value = BigInt(valueHex);
                        const valueDecimal = Number(value) / Math.pow(10, 18);
                        
                        // Subtract from sender (unless it's the zero address = mint)
                        if (fromAddress !== "0x0000000000000000000000000000000000000000") {
                          const currentFrom = addressesWithBalance.get(fromAddress) || 0;
                          addressesWithBalance.set(fromAddress, currentFrom - valueDecimal);
                        }
                        
                        // Add to receiver (unless it's the zero address = burn)
                        if (toAddress !== "0x0000000000000000000000000000000000000000") {
                          const currentTo = addressesWithBalance.get(toAddress) || 0;
                          addressesWithBalance.set(toAddress, currentTo + valueDecimal);
                        }
                      } catch (_parseError) {
                        // Skip invalid values
                      }
                    }
                  });
                  
                  console.log(`[Leaderboard] Processed chunk ${chunk + 1}: ${eventsInChunk} events (Total processed: ${processedEvents})`);
                  
                  // If this chunk returned less than 10,000 events, we might be done
                  if (eventsInChunk < 10000) {
                    break;
                  }
                } else {
                  console.log(`[Leaderboard] No more events in chunk ${chunk + 1}`);
                  break;
                }
              } else {
                const errorText = await logsResponse.text();
                if (errorText.includes('query timeout') || errorText.includes('result size')) {
                  console.log(`[Leaderboard] Query limit reached at chunk ${chunk + 1}, stopping`);
                  break;
                }
              }
              
              // Small delay between chunks
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Filter to only addresses with positive balances (current holders)
            addressesWithBalance.forEach((balance, address) => {
              if (balance > 0) {
                addressToBalance.set(address, balance);
              }
            });
            
            totalTokenHolders = totalHolders || addressToBalance.size;
            console.log(`[Leaderboard] Step 1 Complete: Found ${addressToBalance.size} token holder addresses from ${processedEvents} Transfer events (Total holders: ${totalTokenHolders})`);
          } catch (logsError: any) {
            console.error("[Leaderboard] Error building holder list from Transfer events:", logsError?.message || logsError);
          }
        }
      } catch (holderError: any) {
        console.error("[Leaderboard] Error fetching token holders:", holderError?.message || holderError);
      }
      
      // Step 2: Match holder addresses to Farcaster FIDs
      if (addressToBalance.size === 0) {
        console.log("[Leaderboard] ⚠️ No holders from blockchain. Cannot build leaderboard. Using fallback for known users only.");
        
        // Fallback: Get users from check-ins and channel
        const allCheckins = await getTopUsersByStreak(1000);
        const allFidsSet = new Set<number>();
        
        allCheckins.forEach((c) => {
          allFidsSet.add(c.fid);
          checkinMap.set(c.fid, {
            streak: c.streak || 0,
            last_checkin: c.last_checkin || null,
            total_checkins: c.total_checkins || 0,
          });
        });
        
        try {
          const channelResponse = await fetch(`${new URL(req.url).origin}/api/channel-feed?limit=500`);
          if (channelResponse.ok) {
            const channelData = await channelResponse.json();
            if (channelData.casts && Array.isArray(channelData.casts)) {
              channelData.casts.forEach((cast: any) => {
                if (cast.author?.fid) {
                  allFidsSet.add(cast.author.fid);
                }
              });
            }
          }
        } catch (_channelError) {
          // Continue
        }
        
        fids = Array.from(allFidsSet);
        console.log(`[Leaderboard] Fallback: Using ${fids.length} known users (check-ins + channel)`);
      } else {
        // Step 2: For each holder address, find their Farcaster FID
        console.log(`[Leaderboard] Step 2: Looking up Farcaster FIDs for ${addressToBalance.size} token holder addresses...`);
        const addresses = Array.from(addressToBalance.keys());
        const batchSize = 10;
        let matchedCount = 0;
        
        // Process in batches to avoid rate limits
        for (let i = 0; i < Math.min(addresses.length, 500); i += batchSize) {
          const batch = addresses.slice(i, i + batchSize);
          
          const fidPromises = batch.map(async (address) => {
            try {
              const apiKey = process.env.NEYNAR_API_KEY;
              if (!apiKey) {
                return null;
              }
              
              // Neynar API: lookup user by verified wallet address
              const lookupUrl = `https://api.neynar.com/v2/farcaster/user/by_address?address=${address}`;
              const lookupResponse = await fetch(lookupUrl, {
                headers: {
                  'api_key': apiKey,
                },
              });
              
              if (lookupResponse.ok) {
                const lookupData = await lookupResponse.json();
                const user = lookupData.user || lookupData.users?.[0] || lookupData.result?.user;
                if (user?.fid) {
                  return { address, fid: user.fid };
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
              matchedCount++;
            }
          });
          
          // Progress logging
          if ((i + batchSize) % 50 === 0 || i + batchSize >= addresses.length) {
            console.log(`[Leaderboard] Matched ${matchedCount}/${Math.min(i + batchSize, addresses.length)} addresses to Farcaster FIDs...`);
          }
          
          // Delay between batches
          if (i + batchSize < addresses.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // Step 3: Build FID-to-balance map (sum balances if user has multiple addresses)
        console.log(`[Leaderboard] Step 3: Consolidating balances for ${addressToFid.size} Farcaster users...`);
        addressToFid.forEach((fid, address) => {
          const balance = addressToBalance.get(address) || 0;
          const currentBalance = blockchainBalances.get(fid) || 0;
          blockchainBalances.set(fid, currentBalance + balance); // Sum if user has multiple addresses
        });
        
        fids = Array.from(blockchainBalances.keys());
        totalTokenHolders = totalHolders || addressToBalance.size;
        console.log(`[Leaderboard] Step 2 Complete: Found ${fids.length} Farcaster users among ${addressToBalance.size} token holders (Total holders: ${totalTokenHolders})`);
      }
      
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

    // Step 4: Use balances from blockchain (already matched to FIDs in Step 2-3)
    // For holdings mode: Use blockchain balances we already fetched and matched
    // For streak mode: We don't need balances
    const fidToBalance = new Map<number, number>();
    
    if (sortBy === "holdings") {
      if (blockchainBalances.size > 0) {
        // Use blockchain balances (already matched to FIDs in Step 2-3)
        blockchainBalances.forEach((balance, fid) => {
          fidToBalance.set(fid, balance);
        });
        console.log(`[Leaderboard] Step 4 Complete: Using ${blockchainBalances.size} balances from blockchain (matched to Farcaster FIDs)`);
      } else {
        // Fallback: No blockchain data, fetch from Neynar for known users
        console.log(`[Leaderboard] No blockchain balances available, fetching from Neynar API for ${fids.length} known users...`);
        
        const batchSize = 10;
        let successCount = 0;
        
        for (let i = 0; i < fids.length; i += batchSize) {
          const batch = fids.slice(i, i + batchSize);
          
          const balancePromises = batch.map(async (fid) => {
            try {
              const neynarBalance = await getTokenBalanceFromNeynar(fid);
              if (neynarBalance > 0) {
                successCount++;
                fidToBalance.set(fid, neynarBalance);
              }
              return { fid, balance: neynarBalance };
            } catch (_err: any) {
              return { fid, balance: 0 };
            }
          });
          
          await Promise.all(balancePromises);
          
          if (i + batchSize < fids.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        console.log(`[Leaderboard] Fetched balances from Neynar: ${successCount} users with CATWALK holdings`);
      }
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

