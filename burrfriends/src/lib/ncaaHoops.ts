/**
 * Phase 41: NCAA HOOPS – bracket constants, scoring, entry allowance.
 * 63 matchups: round 1 (1–32) = 1 pt, round 2 (33–48) = 2, round 3 (49–56) = 4,
 * round 4 (57–60) = 8, round 5 (61–62) = 16, championship (63) = 64. Tiebreaker = championship correct.
 */

export const CHAMPIONSHIP_MATCHUP_ID = 63;
export const TOTAL_MATCHUPS = 63;
export const ROUNDS = [1, 2, 3, 4, 5, 6] as const; // round 6 = semis (61–62) + championship (63) worth 64

/** Round number (1–6) for matchup_id 1–63. */
export function getRoundForMatchup(matchupId: number): number {
  if (matchupId >= 1 && matchupId <= 32) return 1;
  if (matchupId <= 48) return 2;
  if (matchupId <= 56) return 3;
  if (matchupId <= 60) return 4;
  if (matchupId <= 62) return 5;
  return 6; // championship
}

/** Points for a correct pick: 1, 2, 4, 8, 16, 32, 64 by round; championship (63) = 64. */
export function getPointsForMatchup(matchupId: number): number {
  if (matchupId >= 1 && matchupId <= 32) return 1;
  if (matchupId <= 48) return 2;
  if (matchupId <= 56) return 4;
  if (matchupId <= 60) return 8;
  if (matchupId <= 62) return 16;
  return 64; // championship
}

/**
 * Entry allowance: tier(max_mint_count) + (isBB ? 1 : 0). Plan 41.8.
 * Tiers: 0→1, 1–10→2, 10–20→3, 20–50→4, 50–100→5, >100→10.
 * Max-mint source TBD; stub = 1 entry until decided. BB +1 uses existing app logic when available.
 */
export function getAllowedEntries(_fid: number, _community: string): number {
  // Stub: 1 entry. TODO: tier from max_mint_count + isBB from app logic.
  return 1;
}
