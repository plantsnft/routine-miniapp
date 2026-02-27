/**
 * Betrmint staking pool integration.
 * 
 * This module now wraps the real BETR staking contract integration.
 * Kept for backward compatibility with existing code that calls checkBetrmintStake().
 */

import { checkUserStakeByFid } from './staking';

export interface BetrmintStakeCheck {
  fid: number;
  poolId: string; // Note: This is ignored (single pool confirmed)
  minAmount: number;
}

/**
 * Check if a user has sufficient stake in BETR staking pool.
 * 
 * @deprecated Use checkUserStakeByFid() directly from staking.ts
 * This is kept for backward compatibility with existing code.
 * 
 * @param params - Stake check parameters
 * @returns true if user meets threshold, false otherwise
 */
export async function checkBetrmintStake(params: BetrmintStakeCheck): Promise<boolean> {
  // Note: params.poolId is ignored (single pool confirmed)
  const result = await checkUserStakeByFid(params.fid, params.minAmount);
  return result.meetsRequirement;
}
