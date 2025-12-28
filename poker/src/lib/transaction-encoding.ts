/**
 * Transaction encoding utilities using ethers.js
 * Encodes function calls for smart contract interactions
 */

import { Interface, AbiCoder } from 'ethers';
import { GAME_ESCROW_ABI, ERC20_ABI } from './contracts';

/**
 * Encode joinGame function call
 * @param gameId The game ID string
 * @returns Encoded function call data (hex string)
 */
export function encodeJoinGame(gameId: string): string {
  const iface = new Interface(GAME_ESCROW_ABI);
  return iface.encodeFunctionData('joinGame', [gameId]);
}

/**
 * Encode ERC20 approve function call
 * @param spender The address to approve
 * @param amount The amount to approve (in token units, as string or bigint)
 * @returns Encoded function call data (hex string)
 */
export function encodeApprove(spender: string, amount: string | bigint): string {
  const iface = new Interface(ERC20_ABI);
  return iface.encodeFunctionData('approve', [spender, amount]);
}

/**
 * Check if a string is a valid hex address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

