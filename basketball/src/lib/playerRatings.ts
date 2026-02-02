/**
 * Player Rating Calculation System
 * 
 * Historical mode uses stat-based ratings instead of tier-based.
 * 
 * Formula:
 * - PPG: 25% weight
 * - RPG: 25% weight
 * - APG: 25% weight
 * - Steals + Blocks: 25% weight (12.5% each)
 * 
 * Normalization:
 * - Top 10% → 90-97 range
 * - Next 25% → 80-89 range
 * - Rest → 55-79 range
 * - Minimum: 55, Maximum: 97
 */

interface PlayerStats {
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
}

interface PlayerWithRating {
  id?: string;
  name: string;
  stats: PlayerStats;
  calculatedRating: number;
  normalizedRating: number;
}

/**
 * Calculate base rating from stats
 * Formula: (PPG * 0.25) + (RPG * 0.25) + (APG * 0.25) + ((SPG + BPG) * 0.125)
 */
export function calculateBaseRating(stats: PlayerStats): number {
  const ppg = stats.ppg || 0;
  const rpg = stats.rpg || 0;
  const apg = stats.apg || 0;
  const spg = stats.spg || 0;
  const bpg = stats.bpg || 0;
  
  const rating = (ppg * 0.25) + (rpg * 0.25) + (apg * 0.25) + ((spg + bpg) * 0.125);
  
  return rating;
}

/**
 * Normalize ratings across all players in a season
 * 
 * Distribution:
 * - Top 10% → 90-97 range
 * - Next 25% → 80-89 range
 * - Rest → 55-79 range
 */
export function normalizeRatings(players: PlayerWithRating[]): PlayerWithRating[] {
  if (players.length === 0) return [];
  
  // Sort by calculated rating (descending)
  const sorted = [...players].sort((a, b) => b.calculatedRating - a.calculatedRating);
  
  const total = sorted.length;
  const top10Percent = Math.ceil(total * 0.10);
  const next25Percent = Math.ceil(total * 0.25);
  
  // Find min/max for each tier
  const top10Min = sorted[top10Percent - 1]?.calculatedRating || sorted[0]?.calculatedRating || 0;
  const top10Max = sorted[0]?.calculatedRating || 0;
  
  const next25Min = sorted[top10Percent + next25Percent - 1]?.calculatedRating || sorted[top10Percent]?.calculatedRating || 0;
  const next25Max = sorted[top10Percent]?.calculatedRating || 0;
  
  const restMin = sorted[total - 1]?.calculatedRating || 0;
  const restMax = sorted[top10Percent + next25Percent]?.calculatedRating || 0;
  
  // Normalize each player
  return sorted.map((player, index) => {
    let normalizedRating: number;
    
    if (index < top10Percent) {
      // Top 10% → 90-97
      if (top10Max === top10Min) {
        normalizedRating = 93.5; // Middle of range
      } else {
        const ratio = (player.calculatedRating - top10Min) / (top10Max - top10Min);
        normalizedRating = 90 + (ratio * 7); // 90 to 97
      }
    } else if (index < top10Percent + next25Percent) {
      // Next 25% → 80-89
      if (next25Max === next25Min) {
        normalizedRating = 84.5; // Middle of range
      } else {
        const ratio = (player.calculatedRating - next25Min) / (next25Max - next25Min);
        normalizedRating = 80 + (ratio * 9); // 80 to 89
      }
    } else {
      // Rest → 55-79
      if (restMax === restMin) {
        normalizedRating = 67; // Middle of range
      } else {
        const ratio = (player.calculatedRating - restMin) / (restMax - restMin);
        normalizedRating = 55 + (ratio * 24); // 55 to 79
      }
    }
    
    // Clamp to valid range
    normalizedRating = Math.max(55, Math.min(97, Math.round(normalizedRating * 100) / 100));
    
    return {
      ...player,
      normalizedRating,
    };
  });
}

/**
 * Calculate starting rating from first varsity season stats
 */
export function calculateStartingRating(firstSeasonStats: PlayerStats): number {
  const baseRating = calculateBaseRating(firstSeasonStats);
  // Starting rating is just the base rating (will be normalized later)
  return baseRating;
}

/**
 * Calculate potential rating from best season stats + 3 points to each stat
 */
export function calculatePotentialRating(bestSeasonStats: PlayerStats): number {
  // Add 3 to each stat category
  const boostedStats: PlayerStats = {
    ppg: (bestSeasonStats.ppg || 0) + 3,
    rpg: (bestSeasonStats.rpg || 0) + 3,
    apg: (bestSeasonStats.apg || 0) + 3,
    spg: (bestSeasonStats.spg || 0) + 3,
    bpg: (bestSeasonStats.bpg || 0) + 3,
  };
  
  const baseRating = calculateBaseRating(boostedStats);
  // Potential rating is the base rating (will be normalized later, then capped at 97)
  return Math.min(97, baseRating);
}

/**
 * Process all players for a season: calculate and normalize ratings
 */
export async function processSeasonRatings(
  players: Array<{ name: string; stats: PlayerStats; id?: string }>
): Promise<PlayerWithRating[]> {
  // Calculate base ratings
  const playersWithRatings: PlayerWithRating[] = players.map(player => ({
    ...player,
    calculatedRating: calculateBaseRating(player.stats),
    normalizedRating: 0, // Will be set by normalizeRatings
  }));
  
  // Normalize ratings
  const normalized = normalizeRatings(playersWithRatings);
  
  return normalized;
}
