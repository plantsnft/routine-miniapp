/**
 * Eligibility checking logic for game participation.
 */

import type { Game, EligibilityResult } from './types';
import { checkBetrmintStake } from './betrmint';

/**
 * Check if a user is eligible to join a game.
 * 
 * @param fid - User's Farcaster ID
 * @param game - Game to check eligibility for
 * @param existingParticipant - Optional existing participant record (if already joined)
 * @returns Eligibility result with reason
 */
export async function canUserJoinGame(
  fid: number,
  game: Game,
  existingParticipant?: { is_eligible: boolean; join_reason?: string | null }
): Promise<EligibilityResult> {
  // If already manually overridden as eligible, they're eligible
  if (existingParticipant?.join_reason === 'manual_override' && existingParticipant.is_eligible) {
    return {
      eligible: true,
      reason: 'manual_override',
      message: 'Manually whitelisted by club owner',
    };
  }

  // If already marked as eligible (e.g., paid), they're eligible
  if (existingParticipant?.is_eligible && existingParticipant.join_reason) {
    return {
      eligible: true,
      reason: existingParticipant.join_reason as any,
      message: getReasonMessage(existingParticipant.join_reason),
    };
  }

  // Check gating type
  // MVP: Anyone can join any game. Payment check happens when accessing credentials.
  const gatingType = game.gating_type || 'entry_fee'; // Default to entry_fee if not set
  
  switch (gatingType) {
    case 'open':
      return {
        eligible: true,
        reason: 'open',
        message: 'Open game - anyone can join',
      };

    case 'entry_fee':
      // MVP: Anyone can join entry_fee games. Payment verification happens when accessing credentials.
      return {
        eligible: true,
        reason: 'entry_fee',
        message: 'Anyone can join. Payment required to access credentials.',
      };

    case 'stake_threshold':
      if (!game.staking_pool_id || !game.staking_min_amount) {
        return {
          eligible: false,
          reason: 'not_eligible',
          message: 'Staking configuration incomplete',
        };
      }

      // Check Betrmint stake
      const hasStake = await checkBetrmintStake({
        fid,
        poolId: game.staking_pool_id,
        minAmount: Number(game.staking_min_amount),
      });

      if (hasStake) {
        return {
          eligible: true,
          reason: 'stake_threshold',
          message: `Staked ${game.staking_min_amount} in pool ${game.staking_pool_id}`,
        };
      }

      return {
        eligible: false,
        reason: 'not_eligible',
        message: `Insufficient stake in pool ${game.staking_pool_id}. Required: ${game.staking_min_amount}`,
      };

    default:
      return {
        eligible: false,
        reason: 'not_eligible',
        message: 'Unknown gating type',
      };
  }
}

function getReasonMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'open':
      return 'Open game';
    case 'entry_fee':
      return 'Entry fee paid';
    case 'stake_threshold':
      return 'Meets stake requirement';
    case 'manual_override':
      return 'Manually whitelisted';
    default:
      return 'Eligible';
  }
}
