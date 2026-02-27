/**
 * Eligibility checking logic for game participation.
 */

import type { Game, EligibilityResult } from './types';
import { checkUserStakeByFid } from './staking';

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
  // Phase 3: Prize-based games have no entry fees, so gating_type is 'open' or 'stake_threshold'
  const gatingType = game.gating_type || 'open'; // Default to 'open' for prize-based games
  
  switch (gatingType) {
    case 'open':
      return {
        eligible: true,
        reason: 'open',
        message: 'Open game - anyone can join',
      };

    case 'entry_fee':
      // DEPRECATED: Entry fee games are no longer created, but keep for backward compatibility
      // For prize-based games, this should never be reached (all games have buy_in_amount = 0)
      return {
        eligible: true,
        reason: 'entry_fee',
        message: 'Anyone can join. Payment required to access credentials.',
      };

    case 'stake_threshold':
      // Note: staking_pool_id is not needed (single pool confirmed)
      // We only need staking_min_amount - staking_token_contract is stored but not used in check
      if (!game.staking_min_amount) {
        return {
          eligible: false,
          reason: 'not_eligible',
          message: 'Staking configuration incomplete',
        };
      }

      // Check staking (uses 1 Neynar API call + RPC calls)
      // Community determines which staking contract to use (BETR or Minted Merch)
      const community = ((game as any).community === 'minted_merch' ? 'minted_merch' : 'betr') as import('~/lib/constants').Community;
      const stakeCheck = await checkUserStakeByFid(
        fid,
        Number(game.staking_min_amount),
        community
      );

      const tokenLabel = community === 'minted_merch' ? 'Minted Merch' : 'BETR';
      if (stakeCheck.meetsRequirement) {
        return {
          eligible: true,
          reason: 'stake_threshold',
          message: `Staked ${stakeCheck.stakedAmount} ${tokenLabel} (required: ${game.staking_min_amount} ${tokenLabel})`,
        };
      }

      return {
        eligible: false,
        reason: 'not_eligible',
        message: `Insufficient stake. Required: ${game.staking_min_amount} ${tokenLabel}, You have: ${stakeCheck.stakedAmount} ${tokenLabel}`,
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
