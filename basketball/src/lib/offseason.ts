/**
 * Offseason Processing Logic
 * 
 * Shared functions for processing offseason and draft.
 * Used by both /api/admin/offseason and /api/cron/advance
 */

import { basketballDb } from './basketballDb';
import { UVA_PLAYER_NAMES_1980_1986 } from './constants';

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const TIERS = ['good', 'great', 'elite'] as const;
const AFFINITIES = ['StrongVsZone', 'StrongVsMan'] as const;

/**
 * Process offseason: aging, retirement, progression, contracts, draft
 * Returns the new season number
 */
export async function processOffseason(): Promise<number> {
  // Get current season state
  const seasonState = await basketballDb.fetch('season_state', { limit: 1 });
  if (seasonState.length === 0) {
    throw new Error('League not initialized');
  }

  const state = seasonState[0];

  if (state.phase !== 'OFFSEASON') {
    throw new Error(`Cannot process offseason when phase is ${state.phase}. Must be OFFSEASON.`);
  }

  const currentSeason = state.season_number;
  const nextSeason = currentSeason + 1;

  // Step 1: Process all players (aging, retirement, progression/regression)
  await processPlayerAgingAndProgression(currentSeason);

  // Step 2: Process contracts (decrement, auto-renew)
  await processContracts();

  // Step 3: Generate draft pool
  const draftPool = await generateDraftPool();

  // Step 4: Execute draft
  await executeDraft(currentSeason, draftPool);

  // Step 5: Reset season state for new season
  await basketballDb.update(
    'season_state',
    { id: state.id },
    {
      season_number: nextSeason,
      day_number: 1,
      phase: 'REGULAR',
      day_type: 'OFFDAY',
    }
  );

  // Step 6: Create initial stats records for new season
  await createInitialStatsForNewSeason(nextSeason);

  return nextSeason;
}

/**
 * Process player aging, retirement, and progression/regression
 */
async function processPlayerAgingAndProgression(seasonNumber: number): Promise<void> {
  // Load all players
  const allPlayers = await basketballDb.fetch('players');

  for (const player of allPlayers) {
    // Age +1
    const newAge = player.age + 1;

    // Retire if age >= 36
    if (newAge >= 36) {
      await basketballDb.delete('players', { id: player.id });
      // Also delete player_season_stats for this player
      await basketballDb.delete('player_season_stats', { player_id: player.id });
      continue;
    }

    // Apply progression/regression
    let newRating = player.rating;
    if (newAge < 25) {
      newRating = player.rating * 1.05;
    } else if (newAge >= 25 && newAge <= 29) {
      newRating = player.rating * 1.03;
    } else if (newAge >= 30) {
      newRating = player.rating * 0.85;
    }

    // Cap by tier
    const tierCap = getTierCap(player.tier);
    newRating = Math.min(tierCap, newRating);

    // Update player
    await basketballDb.update(
      'players',
      { id: player.id },
      {
        age: newAge,
        rating: newRating,
      }
    );
  }
}

/**
 * Process contracts: decrement and auto-renew
 */
async function processContracts(): Promise<void> {
  // Load all players
  const allPlayers = await basketballDb.fetch('players');

  for (const player of allPlayers) {
    const newContractYears = player.contract_years_remaining - 1;

    if (newContractYears <= 0) {
      // Auto-renew: same salary, 3 years (MVP decision)
      await basketballDb.update(
        'players',
        { id: player.id },
        {
          contract_years_remaining: 3,
          // Salary stays the same (already set)
        }
      );
    } else {
      // Just decrement
      await basketballDb.update(
        'players',
        { id: player.id },
        {
          contract_years_remaining: newContractYears,
        }
      );
    }
  }
}

/**
 * Generate draft pool: 10 players (1 Elite, 2 Great, 7 Good)
 */
async function generateDraftPool(): Promise<Array<{
  tier: typeof TIERS[number];
  name: string;
  position: typeof POSITIONS[number];
  affinity: typeof AFFINITIES[number];
}>> {
  // Get all existing player names to avoid duplicates
  const existingPlayers = await basketballDb.fetch('players');
  const usedNames = new Set(existingPlayers.map((p) => p.name));

  // Get available UVA names (not yet used)
  const availableNames = UVA_PLAYER_NAMES_1980_1986.filter((name) => !usedNames.has(name));

  if (availableNames.length < 10) {
    // If we run out of names, we can reuse (but try to avoid if possible)
    // For MVP, we'll use what we have
    console.warn(`[Offseason] Only ${availableNames.length} unique UVA names available, may need to reuse`);
  }

  // Shuffle available names
  const shuffledNames = [...availableNames];
  for (let i = shuffledNames.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledNames[i], shuffledNames[j]] = [shuffledNames[j], shuffledNames[i]];
  }

  // Generate draft pool: 1 Elite, 2 Great, 7 Good
  const draftPool: Array<{
    tier: typeof TIERS[number];
    name: string;
    position: typeof POSITIONS[number];
    affinity: typeof AFFINITIES[number];
  }> = [];

  // 1 Elite
  draftPool.push({
    tier: 'elite',
    name: shuffledNames[0] || `Player ${Date.now()}-1`, // Fallback if names run out
    position: POSITIONS[Math.floor(Math.random() * POSITIONS.length)],
    affinity: AFFINITIES[Math.floor(Math.random() * AFFINITIES.length)],
  });

  // 2 Great
  for (let i = 0; i < 2; i++) {
    draftPool.push({
      tier: 'great',
      name: shuffledNames[1 + i] || `Player ${Date.now()}-${2 + i}`,
      position: POSITIONS[Math.floor(Math.random() * POSITIONS.length)],
      affinity: AFFINITIES[Math.floor(Math.random() * AFFINITIES.length)],
    });
  }

  // 7 Good
  for (let i = 0; i < 7; i++) {
    draftPool.push({
      tier: 'good',
      name: shuffledNames[3 + i] || `Player ${Date.now()}-${5 + i}`,
      position: POSITIONS[Math.floor(Math.random() * POSITIONS.length)],
      affinity: AFFINITIES[Math.floor(Math.random() * AFFINITIES.length)],
    });
  }

  return draftPool;
}

/**
 * Execute draft: reverse standings order, each team drafts 1, cuts 1
 */
async function executeDraft(
  seasonNumber: number,
  draftPool: Array<{
    tier: typeof TIERS[number];
    name: string;
    position: typeof POSITIONS[number];
    affinity: typeof AFFINITIES[number];
  }>
): Promise<void> {
  // Get team standings for the season (reverse order = worst first)
  const allStats = await basketballDb.fetch('team_season_stats', {
    filters: {
      season_number: seasonNumber,
    },
  });

  // Calculate win percentage and sort (worst first = reverse standings)
  const teamsWithStats = await Promise.all(
    allStats.map(async (stat) => {
      const team = await basketballDb.fetch('teams', {
        filters: { id: stat.team_id },
        limit: 1,
      });
      return {
        team: team[0],
        wins: stat.wins,
        losses: stat.losses,
        winPct: stat.games_played > 0 ? stat.wins / stat.games_played : 0,
      };
    })
  );

  // Sort by wins (asc), then win percentage (asc) = worst first
  teamsWithStats.sort((a, b) => {
    if (a.wins !== b.wins) {
      return a.wins - b.wins; // Ascending (worst first)
    }
    return a.winPct - b.winPct; // Ascending (worst first)
  });

  // Draft order: worst team picks first
  let draftPoolIndex = 0;

  for (const { team } of teamsWithStats) {
    if (draftPoolIndex >= draftPool.length) {
      console.warn(`[Offseason] Draft pool exhausted, skipping team ${team.name}`);
      continue;
    }

    const draftPick = draftPool[draftPoolIndex++];

    // Get all players on this team
    const teamPlayers = await basketballDb.fetch('players', {
      filters: { team_id: team.id },
    });

    if (teamPlayers.length === 0) {
      console.warn(`[Offseason] Team ${team.name} has no players, skipping draft`);
      continue;
    }

    // Find lowest-rated player to cut
    const lowestRatedPlayer = teamPlayers.reduce((lowest, player) =>
      player.rating < lowest.rating ? player : lowest
    );

    // Delete the lowest-rated player
    await basketballDb.delete('players', { id: lowestRatedPlayer.id });
    // Also delete player_season_stats
    await basketballDb.delete('player_season_stats', { player_id: lowestRatedPlayer.id });

    // Create new player
    const initialRating = getInitialRating(draftPick.tier);
    const salary = getSalary(draftPick.tier);

    await basketballDb.insert('players', {
      team_id: team.id,
      name: draftPick.name,
      position: draftPick.position,
      tier: draftPick.tier,
      rating: initialRating,
      age: 20, // MVP decision: rookies are age 20
      affinity: draftPick.affinity,
      salary_m: salary,
      contract_years_remaining: 3,
    });
  }
}

/**
 * Create initial stats records for new season
 */
async function createInitialStatsForNewSeason(seasonNumber: number): Promise<void> {
  // Get all teams
  const teams = await basketballDb.fetch('teams');

  // Create team_season_stats for each team
  for (const team of teams) {
    await basketballDb.insert('team_season_stats', {
      season_number: seasonNumber,
      team_id: team.id,
      wins: 0,
      losses: 0,
      games_played: 0,
      points_for: 0,
      points_against: 0,
      streak_type: 'NONE',
      streak_count: 0,
    });
  }

  // Get all players
  const players = await basketballDb.fetch('players');

  // Create player_season_stats for each player
  for (const player of players) {
    await basketballDb.insert('player_season_stats', {
      season_number: seasonNumber,
      player_id: player.id,
      team_id: player.team_id,
      games_played: 0,
      points: 0,
    });
  }
}

/**
 * Get tier cap for a player tier
 */
function getTierCap(tier: string): number {
  switch (tier) {
    case 'good':
      return 80;
    case 'great':
      return 90;
    case 'elite':
      return 99;
    default:
      return 99; // Fallback
  }
}

/**
 * Get initial rating for a tier
 */
function getInitialRating(tier: typeof TIERS[number]): number {
  switch (tier) {
    case 'elite':
      return Math.floor(Math.random() * 5) + 90; // 90-94
    case 'great':
      return Math.floor(Math.random() * 5) + 80; // 80-84
    case 'good':
      return Math.floor(Math.random() * 5) + 70; // 70-74
  }
}

/**
 * Get salary for a tier
 */
function getSalary(tier: typeof TIERS[number]): number {
  switch (tier) {
    case 'elite':
      return 20; // $20M
    case 'great':
      return 15; // $15M
    case 'good':
      return 8; // $8M
  }
}
