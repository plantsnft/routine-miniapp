/**
 * Calculate Historical Player Ratings
 * 
 * This script processes scraped historical player data and calculates:
 * - Starting ratings (from first varsity season)
 * - Potential ratings (from best season + 3 to each stat)
 * - Normalizes ratings across all players in each season
 * 
 * Usage: node scripts/calculate-historical-ratings.mjs [year]
 * If year is not provided, processes all years
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Inline rating logic (same as playerRatings.ts) so .mjs runs without TypeScript
function calculateBaseRating(stats) {
  const ppg = stats.ppg ?? 0;
  const rpg = stats.rpg ?? 0;
  const apg = stats.apg ?? 0;
  const spg = stats.spg ?? 0;
  const bpg = stats.bpg ?? 0;
  return (ppg * 0.25) + (rpg * 0.25) + (apg * 0.25) + ((spg + bpg) * 0.125);
}
function calculateStartingRating(firstSeasonStats) {
  return calculateBaseRating(firstSeasonStats);
}
function calculatePotentialRating(bestSeasonStats) {
  const boosted = {
    ppg: (bestSeasonStats.ppg ?? 0) + 3,
    rpg: (bestSeasonStats.rpg ?? 0) + 3,
    apg: (bestSeasonStats.apg ?? 0) + 3,
    spg: (bestSeasonStats.spg ?? 0) + 3,
    bpg: (bestSeasonStats.bpg ?? 0) + 3,
  };
  return Math.min(97, calculateBaseRating(boosted));
}
function normalizeRatings(players) {
  if (players.length === 0) return [];
  const sorted = [...players].sort((a, b) => b.calculatedRating - a.calculatedRating);
  const total = sorted.length;
  const top10Percent = Math.ceil(total * 0.10);
  const next25Percent = Math.ceil(total * 0.25);
  const top10Min = sorted[top10Percent - 1]?.calculatedRating ?? sorted[0]?.calculatedRating ?? 0;
  const top10Max = sorted[0]?.calculatedRating ?? 0;
  const next25Min = sorted[top10Percent + next25Percent - 1]?.calculatedRating ?? sorted[top10Percent]?.calculatedRating ?? 0;
  const next25Max = sorted[top10Percent]?.calculatedRating ?? 0;
  const restMin = sorted[total - 1]?.calculatedRating ?? 0;
  const restMax = sorted[top10Percent + next25Percent]?.calculatedRating ?? 0;
  return sorted.map((player, index) => {
    let normalizedRating;
    if (index < top10Percent) {
      normalizedRating = top10Max === top10Min ? 93.5 : 90 + ((player.calculatedRating - top10Min) / (top10Max - top10Min)) * 7;
    } else if (index < top10Percent + next25Percent) {
      normalizedRating = next25Max === next25Min ? 84.5 : 80 + ((player.calculatedRating - next25Min) / (next25Max - next25Min)) * 9;
    } else {
      normalizedRating = restMax === restMin ? 67 : 55 + ((player.calculatedRating - restMin) / (restMax - restMin)) * 24;
    }
    normalizedRating = Math.max(55, Math.min(97, Math.round(normalizedRating * 100) / 100));
    return { ...player, normalizedRating };
  });
}

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  db: { schema: 'basketball' },
});

/**
 * Get all players for a season, grouped by name
 */
async function getPlayersBySeason(year) {
  const { data: players, error } = await supabase
    .from('historical_players')
    .select('*')
    .eq('historical_year', year);
  
  if (error) throw error;
  
  // Group by name to find first season and best season
  const playersByName = {};
  
  for (const player of players || []) {
    if (!playersByName[player.name]) {
      playersByName[player.name] = [];
    }
    playersByName[player.name].push(player);
  }
  
  return { players: players || [], playersByName };
}

/**
 * Find first varsity season for a player
 */
function findFirstSeason(playerSeasons) {
  // Sort by year, first one is first varsity season
  const sorted = [...playerSeasons].sort((a, b) => a.historical_year - b.historical_year);
  return sorted[0];
}

/**
 * Find best season for a player (highest calculated rating)
 */
function findBestSeason(playerSeasons) {
  let best = null;
  let bestRating = -1;
  
  for (const season of playerSeasons) {
    const stats = {
      ppg: season.ppg,
      rpg: season.rpg,
      apg: season.apg,
      spg: season.spg,
      bpg: season.bpg,
    };
    
    const raw = calculateBaseRating(stats);
    const rating = (raw === 0 && [stats.ppg, stats.rpg, stats.apg, stats.spg, stats.bpg].every(v => v == null)) ? 60 : raw;
    if (rating > bestRating) {
      bestRating = rating;
      best = season;
    }
  }
  
  return best;
}

/**
 * Process ratings for a single season
 */
async function processSeasonRatings(year) {
  console.log(`\n📊 Processing ratings for ${year}-${year + 1}...`);
  
  const { players, playersByName } = await getPlayersBySeason(year);
  
  if (players.length === 0) {
    console.log(`  ⚠️  No players found for ${year}`);
    return;
  }
  
  // Step 1: Calculate base ratings for all players this season (null stats = default 60 per SoT)
  const playersWithRatings = players.map(player => {
    const stats = {
      ppg: player.ppg,
      rpg: player.rpg,
      apg: player.apg,
      spg: player.spg,
      bpg: player.bpg,
    };
    const rawRating = calculateBaseRating(stats);
    const calculatedRating = (rawRating === 0 && [stats.ppg, stats.rpg, stats.apg, stats.spg, stats.bpg].every(v => v == null))
      ? 60
      : rawRating;
    return {
      id: player.id,
      name: player.name,
      stats,
      calculatedRating,
      normalizedRating: 0, // Will be set by normalizeRatings
    };
  });
  
  // Step 2: Normalize ratings across all players this season
  const normalized = normalizeRatings(playersWithRatings);
  
  console.log(`  ✅ Calculated ratings for ${normalized.length} players`);
  console.log(`     Top 10%: ${normalized.filter(p => p.normalizedRating >= 90).length} players`);
  console.log(`     80-89: ${normalized.filter(p => p.normalizedRating >= 80 && p.normalizedRating < 90).length} players`);
  console.log(`     55-79: ${normalized.filter(p => p.normalizedRating < 80).length} players`);
  
  // Step 3: For each player, find first season and best season
  const updates = [];
  
  for (const [name, seasons] of Object.entries(playersByName)) {
    const firstSeason = findFirstSeason(seasons);
    const bestSeason = findBestSeason(seasons);
    
    // Calculate starting rating from first season
    const firstStats = {
      ppg: firstSeason.ppg,
      rpg: firstSeason.rpg,
      apg: firstSeason.apg,
      spg: firstSeason.spg,
      bpg: firstSeason.bpg,
    };
    const startingRating = calculateStartingRating(firstStats);
    
    // Calculate potential rating from best season + 3
    const bestStats = {
      ppg: bestSeason.ppg,
      rpg: bestSeason.rpg,
      apg: bestSeason.apg,
      spg: bestSeason.spg,
      bpg: bestSeason.bpg,
    };
    const potentialRating = calculatePotentialRating(bestStats);
    
    // Update all seasons for this player with starting/potential ratings
    for (const season of seasons) {
      // Find normalized rating for this specific season
      const normalized = normalized.find(p => p.id === season.id);
      
      updates.push({
        id: season.id,
        starting_rating: normalized ? normalized.normalizedRating : null, // Use normalized for this season as starting
        potential_rating: potentialRating,
        best_season_year: bestSeason.historical_year,
      });
    }
  }
  
  // Step 4: Update database
  console.log(`  💾 Updating ${updates.length} player records...`);
  
  for (const update of updates) {
    const { error } = await supabase
      .from('historical_players')
      .update({
        starting_rating: update.starting_rating,
        potential_rating: update.potential_rating,
        best_season_year: update.best_season_year,
      })
      .eq('id', update.id);
    
    if (error) {
      console.warn(`  ⚠️  Error updating player ${update.id}:`, error.message);
    }
  }
  
  console.log(`  ✅ Updated ratings for ${updates.length} players`);
}

/**
 * Main function
 */
async function main() {
  const yearArg = process.argv[2];
  const years = yearArg ? [parseInt(yearArg)] : [2005, 2006]; // Default to first 2 years
  
  console.log('🚀 Calculating historical player ratings...\n');
  
  for (const year of years) {
    await processSeasonRatings(year);
  }
  
  console.log('\n✅ Rating calculation complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Review ratings in Supabase');
  console.log('   2. Calculate team strength ratings');
  console.log('   3. Mark district games in historical_schedules');
}

main().catch(console.error);
