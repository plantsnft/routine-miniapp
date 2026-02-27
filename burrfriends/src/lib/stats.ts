/**
 * Player statistics calculation and management
 * 
 * This module provides functions to calculate and update player statistics
 * based on game participation and results.
 * 
 * Phase 5: Updated for prize-based games (no entry fees)
 */

import { pokerDb } from './pokerDb';

/**
 * Calculate and update player stats
 * 
 * Stats calculated:
 * - games_played: Number of settled games player participated in (all games, not just wins)
 * - games_won: Number of games with position=1 in game_results
 * - total_winnings: Sum of payout_amount from game_results
 * - net_profit: total_winnings (no entry fees to subtract)
 * 
 * Phase 5: Fixed bug where games_played only counted winners (status='settled').
 * Now correctly counts all games player participated in that are settled.
 * 
 * @param fid - Player's Farcaster ID
 */
export async function updatePlayerStats(fid: number): Promise<void> {
  try {
    // Phase 5.1: FIX: Get all participants (not filtered by status='settled')
    // Only winners get status='settled', but we need to count all games played
    const allParticipants = await pokerDb.fetch('burrfriends_participants', {
      filters: { fid }, // No status filter - get all participants
      select: 'id,game_id,fid',
    });

    // Get all game IDs this player participated in
    const gameIds = allParticipants.map((p: any) => p.game_id);
    const gameIdsSet = new Set(gameIds);

    // Fetch all settled games and filter to only games this player participated in
    const allSettledGames = await pokerDb.fetch('burrfriends_games', {
      filters: { status: 'settled' }, // Filter by GAME status, not participant status
      select: 'id',
    });

    const playerSettledGames = allSettledGames.filter((g: any) => gameIdsSet.has(g.id));
    const gamesPlayed = playerSettledGames.length;
    
    // This correctly counts ALL games player participated in (won or lost)

    // Get game results for this player
    const results = await pokerDb.fetch('burrfriends_game_results', {
      filters: { player_fid: fid },
      select: 'id,game_id,player_fid,position,payout_amount',
    });

    // Calculate games won (position = 1)
    const gamesWon = results.filter((r: any) => r.position === 1).length;

    // Calculate total winnings (sum of payout_amount from results)
    const totalWinnings = results.reduce((sum: number, r: any) => {
      const payoutAmount = r.payout_amount ? parseFloat(String(r.payout_amount)) : 0;
      return sum + payoutAmount;
    }, 0);

    // Phase 5.1: No entry fees, so net_profit = total_winnings
    const netProfit = totalWinnings;

    // Upsert stats (PostgREST will use UNIQUE(fid) constraint for conflict resolution)
    // Phase 5.1: Removed total_entry_fees from upsert (no longer calculated)
    await pokerDb.upsert('burrfriends_stats', {
      fid,
      games_played: gamesPlayed,
      games_won: gamesWon,
      total_winnings: totalWinnings,
      net_profit: netProfit,
    } as any);
  } catch (error) {
    console.error('[stats] Error updating player stats:', error);
    throw error;
  }
}

/**
 * Get player stats
 * 
 * @param fid - Player's Farcaster ID
 * @returns Player stats or null if not found
 */
export async function getPlayerStats(fid: number): Promise<any | null> {
  try {
    const stats = await pokerDb.fetch('burrfriends_stats', {
      filters: { fid },
      limit: 1,
    });

    if (!stats || stats.length === 0) {
      return null;
    }

    return stats[0];
  } catch (error) {
    console.error('[stats] Error fetching player stats:', error);
    throw error;
  }
}
