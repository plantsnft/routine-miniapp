/**
 * Game Simulation Engine
 * 
 * Implements all game simulation logic per SoT:
 * - Schedule generation (round-robin for 4 teams)
 * - Win probability calculation
 * - Score generation
 * - Player point distribution
 * - Stats updates
 */

import { basketballDb } from './basketballDb';

// Types
interface Team {
  id: string;
  name: string;
  prep_boost_active: boolean;
}

interface Player {
  id: string;
  team_id: string;
  name: string;
  rating: number;
  affinity: 'StrongVsZone' | 'StrongVsMan';
}

interface Gameplan {
  team_id: string;
  offense: 'Drive' | 'Shoot';
  defense: 'Zone' | 'Man';
  mentality: 'Aggressive' | 'Conservative' | 'Neutral';
}

interface GameResult {
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  winner_team_id: string;
  player_points: Record<string, number>; // player_id -> points
  overtime_count: number; // Number of overtime periods (0 = no overtime)
}

interface Game {
  id: string;
  season_number: number;
  day_number: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  overtime_count: number;
  status: string;
  played_at: string | null;
}

/**
 * Generate schedule for a given game night (day number)
 * 
 * Schedule pattern (round-robin, 3-day cycle):
 * - GameNight 1: Team1 vs Team2, Team3 vs Team4
 * - GameNight 2: Team1 vs Team3, Team2 vs Team4
 * - GameNight 3: Team1 vs Team4, Team2 vs Team3
 * 
 * Repeats every 3 game nights.
 */
export function generateScheduleForGameNight(
  gameNightNumber: number,
  teams: Team[]
): Array<{ home_team_id: string; away_team_id: string }> {
  if (teams.length !== 4) {
    throw new Error('Schedule generator requires exactly 4 teams');
  }

  // Cycle repeats every 3 game nights
  const cyclePosition = ((gameNightNumber - 1) % 3) + 1;

  const [team1, team2, team3, team4] = teams;

  let games: Array<{ home_team_id: string; away_team_id: string }> = [];

  switch (cyclePosition) {
    case 1:
      // GameNight 1: Team1 vs Team2, Team3 vs Team4
      games = [
        { home_team_id: team1.id, away_team_id: team2.id },
        { home_team_id: team3.id, away_team_id: team4.id },
      ];
      break;
    case 2:
      // GameNight 2: Team1 vs Team3, Team2 vs Team4
      games = [
        { home_team_id: team1.id, away_team_id: team3.id },
        { home_team_id: team2.id, away_team_id: team4.id },
      ];
      break;
    case 3:
      // GameNight 3: Team1 vs Team4, Team2 vs Team3
      games = [
        { home_team_id: team1.id, away_team_id: team4.id },
        { home_team_id: team2.id, away_team_id: team3.id },
      ];
      break;
  }

  return games;
}

/**
 * Calculate RPS advantage/disadvantage
 * Returns: 1.2 if advantaged, 0.8 if disadvantaged
 */
function calculateRPSMultiplier(
  offense: 'Drive' | 'Shoot',
  defense: 'Zone' | 'Man'
): number {
  // Rules:
  // - Drive vs Zone → Defense advantage (offense gets 0.8)
  // - Drive vs Man → Offense advantage (offense gets 1.2)
  // - Shoot vs Zone → Offense advantage (offense gets 1.2)
  // - Shoot vs Man → Defense advantage (offense gets 0.8)

  if (offense === 'Drive' && defense === 'Zone') {
    return 0.8; // Defense advantage
  }
  if (offense === 'Drive' && defense === 'Man') {
    return 1.2; // Offense advantage
  }
  if (offense === 'Shoot' && defense === 'Zone') {
    return 1.2; // Offense advantage
  }
  if (offense === 'Shoot' && defense === 'Man') {
    return 0.8; // Defense advantage
  }

  return 1.0; // Fallback (shouldn't happen)
}

/**
 * Calculate mentality multiplier
 * Returns: 1.2 if correct, 0.8 if wrong, 1.0 if neutral
 */
function calculateMentalityMultiplier(
  mentality: 'Aggressive' | 'Conservative' | 'Neutral',
  opponentDefense: 'Zone' | 'Man'
): number {
  // Rules:
  // - Aggressive vs Zone → +20% (1.2)
  // - Aggressive vs Man → -20% (0.8)
  // - Conservative vs Man → +20% (1.2)
  // - Conservative vs Zone → -20% (0.8)
  // - Neutral → 0% (1.0)

  if (mentality === 'Neutral') {
    return 1.0;
  }

  if (mentality === 'Aggressive') {
    return opponentDefense === 'Zone' ? 1.2 : 0.8;
  }

  if (mentality === 'Conservative') {
    return opponentDefense === 'Man' ? 1.2 : 0.8;
  }

  return 1.0; // Fallback
}

/**
 * Calculate game-only rating multiplier for a team
 */
function calculateGameRatingMultiplier(
  teamGameplan: Gameplan,
  opponentGameplan: Gameplan,
  prepBoostActive: boolean
): number {
  let mult = 1.0;

  // RPS effect (offense vs opponent defense)
  const rpsMult = calculateRPSMultiplier(teamGameplan.offense, opponentGameplan.defense);
  mult *= rpsMult;

  // Mentality effect (mentality vs opponent defense)
  const mentalityMult = calculateMentalityMultiplier(teamGameplan.mentality, opponentGameplan.defense);
  mult *= mentalityMult;

  // Prep boost
  if (prepBoostActive) {
    mult *= 1.25;
  }

  return mult;
}

/**
 * Calculate team's game rating (sum of player ratings * multiplier)
 */
function calculateGameRating(players: Player[], multiplier: number): number {
  const baseRating = players.reduce((sum, p) => sum + p.rating, 0);
  return baseRating * multiplier;
}

/**
 * Calculate win probability for home team
 */
function calculateWinProbability(
  homeGameRating: number,
  awayGameRating: number
): number {
  // Base probability from ratings
  let pHome = homeGameRating / (homeGameRating + awayGameRating);

  // Apply home advantage (+3%)
  pHome = pHome + 0.03;

  // Clamp to [0.15, 0.85]
  pHome = Math.min(0.85, Math.max(0.15, pHome));

  return pHome;
}

/**
 * Generate team score (regular game)
 */
function generateTeamScore(
  avgPlayerRating: number,
  gameRatingShare: number,
  isWinner: boolean
): number {
  // Base points from rating
  const basePts = 55 + avgPlayerRating * 0.55;

  // Performance modifier based on game rating share
  const share = gameRatingShare;
  let teamPts = basePts + (share - 0.5) * 20;

  // Add noise (uniform -8 to +8)
  const noise = Math.random() * 16 - 8;
  teamPts += noise;

  // Round to integer
  teamPts = Math.round(teamPts);

  return teamPts;
}

/**
 * Generate overtime score (smaller scale, 6-15 points range)
 * Uses same formula as regular game but scaled down proportionally
 */
function generateOvertimeScore(
  avgPlayerRating: number,
  gameRatingShare: number
): number {
  // Base points from rating (scaled down by ~9x from regular game)
  // Regular: 55 + avgPlayerRating * 0.55
  // Overtime: 6 + avgPlayerRating * 0.09 (approximately 1/9th scale)
  const basePts = 6 + avgPlayerRating * 0.09;

  // Performance modifier (scaled down by ~6.7x from regular game)
  // Regular: (share - 0.5) * 20
  // Overtime: (share - 0.5) * 3
  const share = gameRatingShare;
  let teamPts = basePts + (share - 0.5) * 3;

  // Add noise (uniform -2 to +2, scaled down from -8 to +8)
  const noise = Math.random() * 4 - 2;
  teamPts += noise;

  // Round to integer
  teamPts = Math.round(teamPts);

  // Clamp to 6-15 range
  teamPts = Math.max(6, Math.min(15, teamPts));

  return teamPts;
}

/**
 * Distribute player points (must sum to team total)
 */
function distributePlayerPoints(
  players: Player[],
  teamTotal: number,
  opponentDefense: 'Zone' | 'Man'
): Record<string, number> {
  // Calculate base weights (proportional to rating)
  const weights = players.map((p) => {
    let weight = p.rating;

    // Apply affinity multiplier
    if (opponentDefense === 'Zone') {
      if (p.affinity === 'StrongVsZone') {
        weight *= 1.15;
      } else {
        weight *= 0.85;
      }
    } else {
      // opponentDefense === 'Man'
      if (p.affinity === 'StrongVsMan') {
        weight *= 1.15;
      } else {
        weight *= 0.85;
      }
    }

    return { playerId: p.id, weight };
  });

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  // Calculate points for each player
  const points: Record<string, number> = {};
  let totalPoints = 0;

  for (const { playerId, weight } of weights) {
    const playerPoints = Math.round((teamTotal * weight) / totalWeight);
    points[playerId] = playerPoints;
    totalPoints += playerPoints;
  }

  // Fix rounding drift by adjusting highest-weight player
  const diff = teamTotal - totalPoints;
  if (diff !== 0) {
    const sortedWeights = [...weights].sort((a, b) => b.weight - a.weight);
    const topPlayerId = sortedWeights[0].playerId;
    points[topPlayerId] = (points[topPlayerId] || 0) + diff;
  }

  return points;
}

/**
 * Simulate a single game
 */
async function simulateGame(
  homeTeam: Team,
  awayTeam: Team,
  homePlayers: Player[],
  awayPlayers: Player[],
  homeGameplan: Gameplan | null,
  awayGameplan: Gameplan | null,
  seasonNumber: number,
  dayNumber: number
): Promise<GameResult> {
  // Default gameplans if missing (worst penalty per SoT)
  // SoT: "Offense and Defense treated as disadvantaged in RPS resolution"
  // SoT: "Mentality treated as wrong (-20%)"
  // For mentality, we'll use a value that gives -20% regardless of opponent defense
  // Since we don't know opponent defense yet, we'll apply -20% directly in the multiplier
  const homePlan: Gameplan = homeGameplan || {
    team_id: homeTeam.id,
    offense: 'Drive', // Will be disadvantaged in RPS
    defense: 'Zone', // Will be disadvantaged in RPS
    mentality: 'Neutral', // Will be treated as wrong (-20%) below
  };

  const awayPlan: Gameplan = awayGameplan || {
    team_id: awayTeam.id,
    offense: 'Drive', // Will be disadvantaged in RPS
    defense: 'Zone', // Will be disadvantaged in RPS
    mentality: 'Neutral', // Will be treated as wrong (-20%) below
  };

  // Calculate game rating multipliers
  let homeMult = calculateGameRatingMultiplier(homePlan, awayPlan, homeTeam.prep_boost_active);
  let awayMult = calculateGameRatingMultiplier(awayPlan, homePlan, awayTeam.prep_boost_active);

  // Apply -20% penalty for missing gameplans (mentality treated as wrong)
  if (!homeGameplan) {
    homeMult *= 0.8; // -20% penalty
  }
  if (!awayGameplan) {
    awayMult *= 0.8; // -20% penalty
  }

  // Calculate game ratings
  const homeGameRating = calculateGameRating(homePlayers, homeMult);
  const awayGameRating = calculateGameRating(awayPlayers, awayMult);

  // Calculate win probability
  const homeWinProb = calculateWinProbability(homeGameRating, awayGameRating);

  // Sample winner
  const homeWins = Math.random() < homeWinProb;
  const winnerTeamId = homeWins ? homeTeam.id : awayTeam.id;

  // Calculate game rating shares for score generation
  const totalGameRating = homeGameRating + awayGameRating;
  const homeShare = homeGameRating / totalGameRating;
  const awayShare = awayGameRating / totalGameRating;

  // Generate scores
  const homeAvgRating = homePlayers.reduce((sum, p) => sum + p.rating, 0) / 5;
  const awayAvgRating = awayPlayers.reduce((sum, p) => sum + p.rating, 0) / 5;

  // Generate scores naturally (no forced adjustment yet)
  let homeScore = generateTeamScore(homeAvgRating, homeShare, homeWins);
  let awayScore = generateTeamScore(awayAvgRating, awayShare, !homeWins);

  // Overtime logic: If scores are tied, simulate overtime periods
  let overtimeCount = 0;
  const MAX_OVERTIMES = 10; // Safety limit to prevent infinite loops

  // Check if scores are tied after initial generation
  if (homeScore === awayScore) {
    // Simulate overtime periods until scores differ
    while (homeScore === awayScore && overtimeCount < MAX_OVERTIMES) {
      overtimeCount++;
      
      // Generate overtime scores (proportional to team strength, smaller scale)
      // Overtime uses same formula but scaled down (6-15 points range)
      const homeOTScore = generateOvertimeScore(homeAvgRating, homeShare);
      const awayOTScore = generateOvertimeScore(awayAvgRating, awayShare);
      
      homeScore += homeOTScore;
      awayScore += awayOTScore;
    }
    
    // If still tied after max overtimes (extremely rare, but safety),
    // force winner based on original probability
    if (homeScore === awayScore) {
      if (homeWins) {
        homeScore += 1;
      } else {
        awayScore += 1;
      }
    }
  }

  // Final guarantee: winner must have higher score
  // This ensures the winner_team_id matches the actual score winner
  // (in case overtime changed the outcome from the original probability)
  if (homeWins && homeScore <= awayScore) {
    homeScore = awayScore + 1;
  } else if (!homeWins && awayScore <= homeScore) {
    awayScore = homeScore + 1;
  }

  // Update winner_team_id based on final scores (ensures it matches actual winner)
  const finalWinnerTeamId = homeScore > awayScore ? homeTeam.id : awayTeam.id;

  // Distribute player points (includes overtime points in total)
  const homePlayerPoints = distributePlayerPoints(homePlayers, homeScore, awayPlan.defense);
  const awayPlayerPoints = distributePlayerPoints(awayPlayers, awayScore, homePlan.defense);

  return {
    home_team_id: homeTeam.id,
    away_team_id: awayTeam.id,
    home_score: homeScore,
    away_score: awayScore,
    winner_team_id: finalWinnerTeamId,
    player_points: { ...homePlayerPoints, ...awayPlayerPoints },
    overtime_count: overtimeCount,
  };
}

/**
 * Simulate all games for a game night
 */
export async function simulateGameNight(
  seasonNumber: number,
  dayNumber: number
): Promise<void> {
  // Load season state
  const seasonState = await basketballDb.fetch('season_state', { limit: 1 });
  if (seasonState.length === 0) {
    throw new Error('Season state not found');
  }

  const state = seasonState[0];
  if (state.day_type !== 'GAMENIGHT') {
    throw new Error(`Cannot simulate games on ${state.day_type}. Current day must be GAMENIGHT.`);
  }

  if (state.season_number !== seasonNumber || state.day_number !== dayNumber) {
    throw new Error(
      `Season/day mismatch. Expected ${seasonNumber}/${dayNumber}, got ${state.season_number}/${state.day_number}`
    );
  }

  // Check if we're in playoffs
  if (state.phase === 'PLAYOFFS') {
    // Handle playoff games
    await simulatePlayoffGameNight(seasonNumber, dayNumber);
    return;
  }

  // Regular season: use round-robin schedule
  // Load all teams and sort by name for consistent ordering
  // Teams should be: Houston, Atlanta, Vegas, NYC (alphabetically sorted)
  const teams = await basketballDb.fetch<Team>('teams');
  if (teams.length !== 4) {
    throw new Error(`Expected 4 teams, found ${teams.length}`);
  }

  // Sort teams by name to ensure consistent ordering (Houston, Atlanta, Vegas, NYC)
  const sortedTeams = teams.sort((a, b) => a.name.localeCompare(b.name));

  // Convert dayNumber to GameNight number
  // Day 1=OFFDAY, Day 2=GAMENIGHT (GameNight 1), Day 3=OFFDAY, Day 4=GAMENIGHT (GameNight 2), etc.
  // So GameNight number = dayNumber / 2
  const gameNightNumber = dayNumber / 2;

  // Generate schedule for this game night
  const scheduledGames = generateScheduleForGameNight(gameNightNumber, sortedTeams);

  // Load all players
  const allPlayers = await basketballDb.fetch<Player>('players');

  // Load gameplans for this day
  const gameplans = await basketballDb.fetch<Gameplan>('gameplans', {
    filters: {
      season_number: seasonNumber,
      day_number: dayNumber,
    },
  });

  // Create gameplan lookup
  const gameplanMap = new Map<string, Gameplan>();
  for (const plan of gameplans) {
    gameplanMap.set(plan.team_id, plan);
  }

  // Simulate each game
  for (const scheduledGame of scheduledGames) {
    const homeTeam = teams.find((t) => t.id === scheduledGame.home_team_id)!;
    const awayTeam = teams.find((t) => t.id === scheduledGame.away_team_id)!;

    const homePlayers = allPlayers.filter((p) => p.team_id === homeTeam.id);
    const awayPlayers = allPlayers.filter((p) => p.team_id === awayTeam.id);

    const homeGameplan = gameplanMap.get(homeTeam.id) || null;
    const awayGameplan = gameplanMap.get(awayTeam.id) || null;

    const result = await simulateGame(
      homeTeam,
      awayTeam,
      homePlayers,
      awayPlayers,
      homeGameplan,
      awayGameplan,
      seasonNumber,
      dayNumber
    );

    // Store game record
    const gameRecord = await basketballDb.insert<{
      season_number: number;
      day_number: number;
      home_team_id: string;
      away_team_id: string;
      home_score: number;
      away_score: number;
      winner_team_id: string;
      overtime_count: number;
      status: string;
      played_at: string;
    }, Game>('games', {
      season_number: seasonNumber,
      day_number: dayNumber,
      home_team_id: result.home_team_id,
      away_team_id: result.away_team_id,
      home_score: result.home_score,
      away_score: result.away_score,
      winner_team_id: result.winner_team_id,
      overtime_count: result.overtime_count,
      status: 'FINAL',
      played_at: new Date().toISOString(),
    });

    const gameId = gameRecord[0].id;

    // Store player lines (with team_id)
    const playerLines = [];
    for (const [playerId, points] of Object.entries(result.player_points)) {
      const player = allPlayers.find((p) => p.id === playerId);
      if (player) {
        playerLines.push({
          game_id: gameId,
          player_id: playerId,
          team_id: player.team_id,
          points: points,
        });
      }
    }

    await basketballDb.insert('game_player_lines', playerLines);

    // Update team stats
    const homeStats = await basketballDb.fetch('team_season_stats', {
      filters: {
        team_id: homeTeam.id,
        season_number: seasonNumber,
      },
      limit: 1,
    });

    const awayStats = await basketballDb.fetch('team_season_stats', {
      filters: {
        team_id: awayTeam.id,
        season_number: seasonNumber,
      },
      limit: 1,
    });

    const homeWon = result.winner_team_id === homeTeam.id;
    const homeWins = homeWon ? 1 : 0;
    const homeLosses = homeWon ? 0 : 1;
    const awayWins = homeWon ? 0 : 1;
    const awayLosses = homeWon ? 1 : 0;

    // Update home team stats
    if (homeStats.length > 0) {
      const current = homeStats[0];
      const newWins = current.wins + homeWins;
      const newLosses = current.losses + homeLosses;
      const newStreak = homeWon
        ? current.streak_type === 'W'
          ? current.streak_count + 1
          : 1
        : current.streak_type === 'L'
          ? current.streak_count + 1
          : 1;
      const newStreakType = homeWon ? 'W' : 'L';

      await basketballDb.update(
        'team_season_stats',
        { id: current.id },
        {
          wins: newWins,
          losses: newLosses,
          points_for: current.points_for + result.home_score,
          points_against: current.points_against + result.away_score,
          streak_count: newStreak,
          streak_type: newStreakType,
          games_played: current.games_played + 1,
        }
      );
    }

    // Update away team stats
    if (awayStats.length > 0) {
      const current = awayStats[0];
      const newWins = current.wins + awayWins;
      const newLosses = current.losses + awayLosses;
      const newStreak = !homeWon
        ? current.streak_type === 'W'
          ? current.streak_count + 1
          : 1
        : current.streak_type === 'L'
          ? current.streak_count + 1
          : 1;
      const newStreakType = !homeWon ? 'W' : 'L';

      await basketballDb.update(
        'team_season_stats',
        { id: current.id },
        {
          wins: newWins,
          losses: newLosses,
          points_for: current.points_for + result.away_score,
          points_against: current.points_against + result.home_score,
          streak_count: newStreak,
          streak_type: newStreakType,
          games_played: current.games_played + 1,
        }
      );
    }

    // Update player stats
    for (const [playerId, points] of Object.entries(result.player_points)) {
      const playerStats = await basketballDb.fetch('player_season_stats', {
        filters: {
          player_id: playerId,
          season_number: seasonNumber,
        },
        limit: 1,
      });

      if (playerStats.length > 0) {
        const current = playerStats[0];
        await basketballDb.update(
          'player_season_stats',
          { id: current.id },
          {
            points: current.points + points,
            games_played: current.games_played + 1,
          }
        );
      }
    }

    // Consume prep boosts (set to false)
    if (homeTeam.prep_boost_active) {
      await basketballDb.update('teams', { id: homeTeam.id }, { prep_boost_active: false });
    }
    if (awayTeam.prep_boost_active) {
      await basketballDb.update('teams', { id: awayTeam.id }, { prep_boost_active: false });
    }
  }
}

/**
 * Get top 2 teams by record for playoffs
 * Sorted by: wins (desc), then win percentage (desc)
 */
async function getTop2Teams(seasonNumber: number): Promise<Team[]> {
  // Load all team stats for the season
  const allStats = await basketballDb.fetch('team_season_stats', {
    filters: {
      season_number: seasonNumber,
    },
  });

  // Calculate win percentage and sort
  const teamsWithStats = await Promise.all(
    allStats.map(async (stat) => {
      const team = await basketballDb.fetch<Team>('teams', {
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

  // Sort by wins (desc), then win percentage (desc)
  teamsWithStats.sort((a, b) => {
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }
    return b.winPct - a.winPct;
  });

  // Return top 2 teams
  return teamsWithStats.slice(0, 2).map((t) => t.team);
}

/**
 * Get playoff series state (games won by each team)
 * Returns: { higherSeedWins: number, lowerSeedWins: number }
 */
async function getPlayoffSeriesState(
  seasonNumber: number,
  higherSeedId: string,
  lowerSeedId: string
): Promise<{ higherSeedWins: number; lowerSeedWins: number }> {
  // Load all playoff games for this season
  const playoffGames = await basketballDb.fetch('games', {
    filters: {
      season_number: seasonNumber,
    },
  });

  // Filter to games between these two teams
  const seriesGames = playoffGames.filter(
    (game) =>
      (game.home_team_id === higherSeedId && game.away_team_id === lowerSeedId) ||
      (game.home_team_id === lowerSeedId && game.away_team_id === higherSeedId)
  );

  let higherSeedWins = 0;
  let lowerSeedWins = 0;

  for (const game of seriesGames) {
    if (game.winner_team_id === higherSeedId) {
      higherSeedWins++;
    } else if (game.winner_team_id === lowerSeedId) {
      lowerSeedWins++;
    }
  }

  return { higherSeedWins, lowerSeedWins };
}

/**
 * Generate playoff schedule for a specific game night
 * GameNight 28 = Game 1 (higher seed home)
 * GameNight 29 = Game 2 (lower seed home)
 * GameNight 30 = Game 3 (if needed, higher seed home)
 */
async function generatePlayoffSchedule(
  gameNightNumber: number,
  higherSeed: Team,
  lowerSeed: Team,
  seriesState: { higherSeedWins: number; lowerSeedWins: number }
): Promise<Array<{ home_team_id: string; away_team_id: string }> | null> {
  // GameNight 28 = Game 1 (higher seed home)
  if (gameNightNumber === 28) {
    return [{ home_team_id: higherSeed.id, away_team_id: lowerSeed.id }];
  }

  // GameNight 29 = Game 2 (lower seed home)
  if (gameNightNumber === 29) {
    return [{ home_team_id: lowerSeed.id, away_team_id: higherSeed.id }];
  }

  // GameNight 30 = Game 3 (if needed, higher seed home)
  if (gameNightNumber === 30) {
    // Only play Game 3 if series is tied 1-1
    if (seriesState.higherSeedWins === 1 && seriesState.lowerSeedWins === 1) {
      return [{ home_team_id: higherSeed.id, away_team_id: lowerSeed.id }];
    }
    // Series already decided, no game needed
    return null;
  }

  return null;
}

/**
 * Simulate playoff games for a game night
 */
async function simulatePlayoffGameNight(
  seasonNumber: number,
  dayNumber: number
): Promise<void> {
  // Get top 2 teams
  const top2Teams = await getTop2Teams(seasonNumber);
  if (top2Teams.length !== 2) {
    throw new Error(`Expected 2 teams for playoffs, found ${top2Teams.length}`);
  }

  const [higherSeed, lowerSeed] = top2Teams;

  // Get current series state
  const seriesState = await getPlayoffSeriesState(
    seasonNumber,
    higherSeed.id,
    lowerSeed.id
  );

  // Convert dayNumber to GameNight number
  const gameNightNumber = dayNumber / 2;

  // Generate playoff schedule for this game night
  const scheduledGames = await generatePlayoffSchedule(
    gameNightNumber,
    higherSeed,
    lowerSeed,
    seriesState
  );

  // If no game scheduled (series already decided), return
  if (!scheduledGames || scheduledGames.length === 0) {
    return;
  }

  // Load all players
  const allPlayers = await basketballDb.fetch<Player>('players');

  // Load gameplans for this day
  const gameplans = await basketballDb.fetch<Gameplan>('gameplans', {
    filters: {
      season_number: seasonNumber,
      day_number: dayNumber,
    },
  });

  // Create gameplan lookup
  const gameplanMap = new Map<string, Gameplan>();
  for (const plan of gameplans) {
    gameplanMap.set(plan.team_id, plan);
  }

  // Simulate each playoff game
  for (const scheduledGame of scheduledGames) {
    const homeTeam = scheduledGame.home_team_id === higherSeed.id ? higherSeed : lowerSeed;
    const awayTeam = scheduledGame.away_team_id === higherSeed.id ? higherSeed : lowerSeed;

    const homePlayers = allPlayers.filter((p) => p.team_id === homeTeam.id);
    const awayPlayers = allPlayers.filter((p) => p.team_id === awayTeam.id);

    const homeGameplan = gameplanMap.get(homeTeam.id) || null;
    const awayGameplan = gameplanMap.get(awayTeam.id) || null;

    const result = await simulateGame(
      homeTeam,
      awayTeam,
      homePlayers,
      awayPlayers,
      homeGameplan,
      awayGameplan,
      seasonNumber,
      dayNumber
    );

    // Store game record (same as regular season)
    const gameRecord = await basketballDb.insert<{
      season_number: number;
      day_number: number;
      home_team_id: string;
      away_team_id: string;
      home_score: number;
      away_score: number;
      winner_team_id: string;
      overtime_count: number;
      status: string;
      played_at: string;
    }, Game>('games', {
      season_number: seasonNumber,
      day_number: dayNumber,
      home_team_id: result.home_team_id,
      away_team_id: result.away_team_id,
      home_score: result.home_score,
      away_score: result.away_score,
      winner_team_id: result.winner_team_id,
      overtime_count: result.overtime_count,
      status: 'FINAL',
      played_at: new Date().toISOString(),
    });

    const gameId = gameRecord[0].id;

    // Store player lines
    const playerLines = [];
    for (const [playerId, points] of Object.entries(result.player_points)) {
      const player = allPlayers.find((p) => p.id === playerId);
      if (player) {
        playerLines.push({
          game_id: gameId,
          player_id: playerId,
          team_id: player.team_id,
          points: points,
        });
      }
    }

    await basketballDb.insert('game_player_lines', playerLines);

    // Update team stats (playoff games count toward season stats)
    const homeStats = await basketballDb.fetch('team_season_stats', {
      filters: {
        team_id: homeTeam.id,
        season_number: seasonNumber,
      },
      limit: 1,
    });

    const awayStats = await basketballDb.fetch('team_season_stats', {
      filters: {
        team_id: awayTeam.id,
        season_number: seasonNumber,
      },
      limit: 1,
    });

    const homeWon = result.winner_team_id === homeTeam.id;
    const homeWins = homeWon ? 1 : 0;
    const homeLosses = homeWon ? 0 : 1;
    const awayWins = homeWon ? 0 : 1;
    const awayLosses = homeWon ? 1 : 0;

    // Update home team stats
    if (homeStats.length > 0) {
      const current = homeStats[0];
      const newWins = current.wins + homeWins;
      const newLosses = current.losses + homeLosses;
      const newStreak = homeWon
        ? current.streak_type === 'W'
          ? current.streak_count + 1
          : 1
        : current.streak_type === 'L'
          ? current.streak_count + 1
          : 1;
      const newStreakType = homeWon ? 'W' : 'L';

      await basketballDb.update(
        'team_season_stats',
        { id: current.id },
        {
          wins: newWins,
          losses: newLosses,
          points_for: current.points_for + result.home_score,
          points_against: current.points_against + result.away_score,
          streak_count: newStreak,
          streak_type: newStreakType,
          games_played: current.games_played + 1,
        }
      );
    }

    // Update away team stats
    if (awayStats.length > 0) {
      const current = awayStats[0];
      const newWins = current.wins + awayWins;
      const newLosses = current.losses + awayLosses;
      const newStreak = !homeWon
        ? current.streak_type === 'W'
          ? current.streak_count + 1
          : 1
        : current.streak_type === 'L'
          ? current.streak_count + 1
          : 1;
      const newStreakType = !homeWon ? 'W' : 'L';

      await basketballDb.update(
        'team_season_stats',
        { id: current.id },
        {
          wins: newWins,
          losses: newLosses,
          points_for: current.points_for + result.away_score,
          points_against: current.points_against + result.home_score,
          streak_count: newStreak,
          streak_type: newStreakType,
          games_played: current.games_played + 1,
        }
      );
    }

    // Update player stats
    for (const [playerId, points] of Object.entries(result.player_points)) {
      const playerStats = await basketballDb.fetch('player_season_stats', {
        filters: {
          player_id: playerId,
          season_number: seasonNumber,
        },
        limit: 1,
      });

      if (playerStats.length > 0) {
        const current = playerStats[0];
        await basketballDb.update(
          'player_season_stats',
          { id: current.id },
          {
            points: current.points + points,
            games_played: current.games_played + 1,
          }
        );
      }
    }

    // Consume prep boosts
    if (homeTeam.prep_boost_active) {
      await basketballDb.update('teams', { id: homeTeam.id }, { prep_boost_active: false });
    }
    if (awayTeam.prep_boost_active) {
      await basketballDb.update('teams', { id: awayTeam.id }, { prep_boost_active: false });
    }
  }
}
