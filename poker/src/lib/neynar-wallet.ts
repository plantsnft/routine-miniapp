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

