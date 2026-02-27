/**
 * Neynar embedded wallet utilities for Base network payments
 */

import { BASE_CHAIN_ID, BASE_USDC_ADDRESS, GAME_ESCROW_CONTRACT } from './constants';
import { GAME_ESCROW_ABI, ERC20_ABI } from './contracts';
import { getNeynarClient } from './neynar';
import { ethToWei, usdcToUnits, amountToUnits } from './amounts';

// Re-export for backwards compatibility
export { ethToWei, usdcToUnits, amountToUnits };

export interface PaymentRequest {
  gameId: string;
  amount: string; // in wei or token units
  currency: 'ETH' | 'USDC';
  playerFid: number;
}

export interface PaymentResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Get player's wallet address from Neynar (primary address - for backward compatibility)
 * @deprecated Use getAllPlayerWalletAddresses() for security checks
 */
export async function getPlayerWalletAddress(fid: number): Promise<string | null> {
  const addresses = await getAllPlayerWalletAddresses(fid);
  return addresses[0] || null;
}

/**
 * Get all wallet addresses that should be considered "owned" by the user
 * Returns deduped list of:
 * - Custody address (user.custody_address)
 * - Verified Ethereum addresses (user.verified_addresses?.eth_addresses)
 * 
 * Note: Connected/smart wallet addresses are not available in Neynar API responses.
 * If we need those, we would need to get them from the auth session or client-side wallet connection.
 * 
 * @param fid Farcaster ID
 * @returns Array of lowercase addresses (deduped)
 */
export async function getAllPlayerWalletAddresses(fid: number): Promise<string[]> {
  try {
    const client = getNeynarClient();
    const { users } = await client.fetchBulkUsers({ fids: [fid] });
    const user = users[0];
    if (!user) return [];
    
    const addresses = new Set<string>();
    
    // Add custody address (if available)
    if (user.custody_address) {
      addresses.add(user.custody_address.toLowerCase());
    }
    
    // Add verified Ethereum addresses
    if (user.verified_addresses?.eth_addresses) {
      for (const addr of user.verified_addresses.eth_addresses) {
        if (addr) {
          addresses.add(addr.toLowerCase());
        }
      }
    }
    
    return Array.from(addresses);
  } catch (error) {
    console.error('[neynar-wallet] Error fetching wallet addresses:', error);
    return [];
  }
}

/**
 * Get wallet addresses for multiple FIDs in a single batched API call (Phase 1 optimization)
 * Returns a Map where key is FID and value is array of addresses (same format as getAllPlayerWalletAddresses)
 * 
 * Benefits:
 * - Reduces Neynar API calls from N to 1 (e.g., 3 winners = 3 calls → 1 call)
 * - Same return format and error handling as getAllPlayerWalletAddresses
 * - If a FID is not found, it will have an empty array [] in the Map
 * 
 * @param fids Array of Farcaster IDs
 * @returns Map<fid, string[]> where value is array of lowercase addresses (deduped)
 */
export async function getBulkWalletAddresses(fids: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  
  // Handle empty input
  if (!fids || fids.length === 0) {
    return result;
  }
  
  // Dedupe FIDs to avoid duplicate API calls
  const uniqueFids = Array.from(new Set(fids.filter(fid => fid && !isNaN(fid))));
  if (uniqueFids.length === 0) {
    return result;
  }
  
  try {
    const client = getNeynarClient();
    const { users } = await client.fetchBulkUsers({ fids: uniqueFids });
    
    // Initialize all FIDs with empty arrays (in case some are not returned)
    for (const fid of uniqueFids) {
      result.set(fid, []);
    }
    
    // Process returned users
    if (users && users.length > 0) {
      for (const user of users) {
        const fid = (user as any).fid;
        if (!fid) continue;
        
        const addresses = new Set<string>();
        
        // Add custody address (if available)
        if (user.custody_address) {
          addresses.add(user.custody_address.toLowerCase());
        }
        
        // Add verified Ethereum addresses
        if (user.verified_addresses?.eth_addresses) {
          for (const addr of user.verified_addresses.eth_addresses) {
            if (addr) {
              addresses.add(addr.toLowerCase());
            }
          }
        }
        
        result.set(fid, Array.from(addresses));
      }
    }
    
    return result;
  } catch (error) {
    console.error('[neynar-wallet] Error fetching bulk wallet addresses:', error);
    // Return Map with empty arrays for all FIDs on error (same behavior as getAllPlayerWalletAddresses)
    for (const fid of uniqueFids) {
      result.set(fid, []);
    }
    return result;
  }
}

/**
 * Prepare payment transaction data for ETH payment
 */
export function prepareETHPayment(gameId: string, amountWei: string) {
  return {
    to: GAME_ESCROW_CONTRACT,
    value: amountWei,
    data: encodeJoinGame(gameId),
  };
}

/**
 * Prepare payment transaction data for USDC payment
 * Returns both approve and join transactions
 */
export function prepareUSDCPayment(gameId: string, amountWei: string) {
  const escrowContract = GAME_ESCROW_CONTRACT;
  
  // First, approve USDC spending
  const approveTx = {
    to: BASE_USDC_ADDRESS,
    value: '0',
    data: encodeApprove(escrowContract, amountWei),
  };

  // Then, join game (contract will transferFrom)
  const joinTx = {
    to: escrowContract,
    value: '0',
    data: encodeJoinGame(gameId),
  };

  return { approveTx, joinTx };
}

/**
 * Encode joinGame function call
 */
function encodeJoinGame(gameId: string): string {
  // This is a simplified version - in production, use ethers.js or viem
  // For now, we'll return the function selector + encoded params
  // The actual encoding should be done client-side with a proper library
  return `0x${Buffer.from('joinGame(string)').toString('hex').slice(0, 8)}${encodeString(gameId)}`;
}

/**
 * Encode approve function call
 */
function encodeApprove(spender: string, amount: string): string {
  return `0x${Buffer.from('approve(address,uint256)').toString('hex').slice(0, 8)}${encodeAddress(spender)}${encodeUint256(amount)}`;
}

/**
 * Simple encoding helpers (simplified - use proper library in production)
 */
function encodeString(value: string): string {
  // Simplified - use proper ABI encoding in production
  return Buffer.from(value).toString('hex').padEnd(64, '0');
}

function encodeAddress(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

function encodeUint256(value: string): string {
  return BigInt(value).toString(16).padStart(64, '0');
}

// Amount conversion functions moved to amounts.ts
// Re-exported above for backwards compatibility

/**
 * Get Base network configuration for wallet connection
 */
export function getBaseNetworkConfig() {
  return {
    chainId: BASE_CHAIN_ID,
    chainName: 'Base',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  };
}

