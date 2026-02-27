/**
 * BETR staking contract integration
 * 
 * This module provides functions to check user staking amounts from the BETR staking contract.
 * It optimizes Neynar credit usage by using direct RPC calls for staking queries.
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.8):
 * Caches wallet addresses by FID to reduce Neynar calls for repeated staking checks.
 * Eligibility (meetsRequirement) is always computed from RPC so users who just staked are not blocked.
 */

import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { BASE_RPC_URL, BETR_STAKING_CONTRACT_ADDRESS, COMMUNITY_CONFIG } from '~/lib/constants';
import type { Community } from '~/lib/constants';
import { getAllPlayerWalletAddresses } from '~/lib/neynar-wallet';
import { cacheGet, cacheSet, CACHE_NS, CACHE_TTL } from '~/lib/cache';
import { pokerDb } from '~/lib/pokerDb';

// Staking cache duration for lobby chat (avoids RPC rate limits)
const STAKE_CACHE_SECONDS = 300; // 5 minutes

// Staking contract ABI for BETR: stakedAmount(address)
const BETR_STAKING_ABI = [
  {
    name: 'stakedAmount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Staking contract ABI for Minted Merch: balanceOf(address)
const MINTED_MERCH_STAKING_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface StakingCheckResult {
  hasStake: boolean;
  stakedAmount: string; // Human-readable BETR amount (sum across all wallets)
  meetsRequirement: boolean;
  checkedAddresses: string[]; // Addresses that were checked
}

/**
 * Check if a user (by FID) has sufficient tokens staked across all their wallets.
 * Supports BETR (stakedAmount) and Minted Merch (balanceOf) communities.
 *
 * Neynar Credit Usage: 1 API call (to get wallet addresses from FID)
 * RPC Calls: N calls (one per wallet address, using viem - no Neynar credits)
 *
 * @param fid - User's Farcaster ID
 * @param minAmount - Minimum staked amount required (in token units, e.g. 5, 25, 50)
 * @param community - Community whose staking contract to use (default: 'betr')
 * @returns Staking check result with total staked amount across all wallets
 */
export async function checkUserStakeByFid(
  fid: number,
  minAmount: number | null,
  community: Community = 'betr'
): Promise<StakingCheckResult> {
  if (!minAmount || minAmount === 0) {
    return {
      hasStake: true,
      stakedAmount: '0',
      meetsRequirement: true,
      checkedAddresses: [],
    };
  }

  try {
    // OPTIMIZATION: Check cache first for wallet addresses
    const cacheKey = String(fid);
    let walletAddresses = cacheGet<string[]>(CACHE_NS.WALLET_ADDRESSES, cacheKey);
    
    if (!walletAddresses) {
      // Get all wallet addresses for this FID (uses Neynar API - 1 credit)
      walletAddresses = await getAllPlayerWalletAddresses(fid);
      // Cache addresses (not eligibility) so users who just staked are not blocked
      if (walletAddresses.length > 0) {
        cacheSet(CACHE_NS.WALLET_ADDRESSES, cacheKey, walletAddresses, CACHE_TTL.WALLET_ADDRESSES);
      }
    }
    
    if (walletAddresses.length === 0) {
      // No wallet addresses found - user can't have staked
      return {
        hasStake: false,
        stakedAmount: '0',
        meetsRequirement: false,
        checkedAddresses: [],
      };
    }

    // Resolve community config (staking contract + ABI function)
    const cfg = COMMUNITY_CONFIG[community];
    const stakingAbi = community === 'minted_merch' ? MINTED_MERCH_STAKING_ABI : BETR_STAKING_ABI;

    // Create public client for RPC calls (no Neynar credits)
    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    // Check staking amount for each wallet address and sum them
    let totalStakedWei = 0n;
    const checkedAddresses: string[] = [];

    for (const address of walletAddresses) {
      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const stakedAmountWei = await publicClient.readContract({
            address: cfg.stakingAddress as `0x${string}`,
            abi: stakingAbi,
            functionName: cfg.stakingFn,
            args: [address as `0x${string}`],
          });

          totalStakedWei += stakedAmountWei as bigint;
          checkedAddresses.push(address);
          break; // success, move to next address
        } catch (error) {
          if (attempt < MAX_RETRIES) {
            const delay = (attempt + 1) * 1500; // 1.5s, 3s
            console.warn(`[staking] Retry ${attempt + 1}/${MAX_RETRIES} for ${address} in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.error(`[staking] Failed stake check for ${address} after ${MAX_RETRIES + 1} attempts:`, error);
          }
        }
      }
    }

    // Convert from wei to BETR (18 decimals)
    const stakedAmount = formatUnits(totalStakedWei, 18);
    const stakedAmountNum = parseFloat(stakedAmount);

    return {
      hasStake: stakedAmountNum > 0,
      stakedAmount,
      meetsRequirement: stakedAmountNum >= minAmount,
      checkedAddresses,
    };
  } catch (error) {
    console.error('[staking] Error checking stake:', error);
    // Fail closed - if we can't check, deny access
    return {
      hasStake: false,
      stakedAmount: '0',
      meetsRequirement: false,
      checkedAddresses: [],
    };
  }
}

/**
 * Check staking amount for a specific wallet address (direct, no FID needed)
 * Useful for batch operations or when you already have the address
 * 
 * Neynar Credit Usage: 0 (direct RPC call)
 * 
 * @param walletAddress - User's wallet address
 * @param minAmount - Minimum staked amount required (in BETR)
 * @returns Staking check result
 */
export async function checkUserStakeByAddress(
  walletAddress: string,
  minAmount: number | null
): Promise<StakingCheckResult> {
  if (!minAmount || minAmount === 0) {
    return {
      hasStake: true,
      stakedAmount: '0',
      meetsRequirement: true,
      checkedAddresses: [],
    };
  }

  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    const stakedAmountWei = await publicClient.readContract({
      address: BETR_STAKING_CONTRACT_ADDRESS as `0x${string}`,
      abi: BETR_STAKING_ABI,
      functionName: 'stakedAmount',
      args: [walletAddress as `0x${string}`],
    });

    const stakedAmount = formatUnits(stakedAmountWei as bigint, 18);
    const stakedAmountNum = parseFloat(stakedAmount);

    return {
      hasStake: stakedAmountNum > 0,
      stakedAmount,
      meetsRequirement: stakedAmountNum >= minAmount,
      checkedAddresses: [walletAddress],
    };
  } catch (error) {
    console.error('[staking] Error checking stake:', error);
    return {
      hasStake: false,
      stakedAmount: '0',
      meetsRequirement: false,
      checkedAddresses: [],
    };
  }
}

/**
 * Check staking with database cache (for lobby chat endpoints)
 * 
 * Phase 19.3: Caches staking verification in lobby_presence.stake_verified_at
 * to avoid Base RPC rate limits (429 errors) from frequent polling.
 * 
 * @param fid - User's Farcaster ID
 * @param minAmount - Minimum staked amount required (in BETR)
 * @returns Object with meetsRequirement and fromCache flags
 */
export async function checkStakeWithCache(
  fid: number,
  minAmount: number
): Promise<{ meetsRequirement: boolean; fromCache: boolean }> {
  try {
    // 1. Check if user has recent stake verification in lobby_presence
    const cutoff = new Date(Date.now() - STAKE_CACHE_SECONDS * 1000).toISOString();
    const presence = await pokerDb.fetch<{ fid: number; stake_verified_at: string | null }>(
      "lobby_presence",
      { select: "fid,stake_verified_at", limit: 1000 }
    );
    
    const userPresence = (presence || []).find(p => Number(p.fid) === fid);
    
    if (userPresence?.stake_verified_at && 
        new Date(userPresence.stake_verified_at) > new Date(cutoff)) {
      // Cache hit - user was verified within last 5 minutes
      return { meetsRequirement: true, fromCache: true };
    }
    
    // 2. No cache or stale - call RPC to verify
    const result = await checkUserStakeByFid(fid, minAmount);
    
    // 3. If verified, update cache timestamp
    if (result.meetsRequirement) {
      await pokerDb.upsert("lobby_presence", [{ 
        fid, 
        stake_verified_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }]);
    }
    
    return { meetsRequirement: result.meetsRequirement, fromCache: false };
  } catch (error) {
    console.error('[staking] Error in checkStakeWithCache:', error);
    // On error, try direct check as fallback
    try {
      const result = await checkUserStakeByFid(fid, minAmount);
      return { meetsRequirement: result.meetsRequirement, fromCache: false };
    } catch {
      // If even fallback fails, deny access
      return { meetsRequirement: false, fromCache: false };
    }
  }
}
