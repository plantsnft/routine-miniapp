/**
 * Cleanup Burrfriends Script
 * 
 * Removes all Burrfriends data from poker.* schema:
 * - Burrfriends club row
 * - Burrfriends club_members entries
 * - Games associated with Burrfriends
 * - Participants/payouts/results for Burrfriends games
 * 
 * This is a one-time cleanup script for Hellfire-only MVP.
 * 
 * Usage:
 *   tsx scripts/cleanup-burrfriends.ts
 * 
 * Requires:
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) environment variable
 *   - SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY) environment variable
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { pokerDb } from '../src/lib/pokerDb';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function cleanupBurrfriends() {
  console.log('Starting Burrfriends cleanup...');
  
  try {
    // 1. Find Burrfriends club
    const burrfriendsClubs = await pokerDb.fetch('clubs', {
      filters: { slug: 'burrfriends' },
      limit: 1,
    });

    if (burrfriendsClubs.length === 0) {
      console.log('✓ No Burrfriends club found - nothing to clean up');
      return;
    }

    const burrfriendsClub = burrfriendsClubs[0] as any;
    const burrfriendsClubId = burrfriendsClub.id;

    console.log(`Found Burrfriends club (ID: ${burrfriendsClubId})`);

    // 2. Find all games for Burrfriends
    const burrfriendsGames = await pokerDb.fetch('games', {
      filters: { club_id: burrfriendsClubId },
    });

    console.log(`Found ${burrfriendsGames.length} games associated with Burrfriends`);

    // 3. Delete in order (respect foreign key constraints)
    //    Order: payouts -> game_results -> participants -> games -> club_members -> clubs

    for (const game of burrfriendsGames) {
      const gameId = (game as any).id;
      
      // Delete payouts for this game
      try {
        await pokerDb.delete('payouts', { game_id: gameId });
        console.log(`  ✓ Deleted payouts for game ${gameId}`);
      } catch (err: any) {
        console.warn(`  ⚠ Could not delete payouts for game ${gameId}:`, err.message);
      }

      // Delete game_results for this game
      try {
        await pokerDb.delete('game_results', { game_id: gameId });
        console.log(`  ✓ Deleted game_results for game ${gameId}`);
      } catch (err: any) {
        console.warn(`  ⚠ Could not delete game_results for game ${gameId}:`, err.message);
      }

      // Delete participants for this game
      try {
        await pokerDb.delete('participants', { game_id: gameId });
        console.log(`  ✓ Deleted participants for game ${gameId}`);
      } catch (err: any) {
        console.warn(`  ⚠ Could not delete participants for game ${gameId}:`, err.message);
      }

      // Delete audit_log entries for this game (if game_id column exists)
      try {
        await pokerDb.delete('audit_log', { game_id: gameId });
        console.log(`  ✓ Deleted audit_log entries for game ${gameId}`);
      } catch (err: any) {
        // Audit log might not have game_id, ignore errors
        console.log(`  - Skipped audit_log for game ${gameId} (may not have game_id column)`);
      }
    }

    // Delete games
    if (burrfriendsGames.length > 0) {
      try {
        await pokerDb.delete('games', { club_id: burrfriendsClubId });
        console.log(`✓ Deleted ${burrfriendsGames.length} games`);
      } catch (err: any) {
        console.error(`✗ Failed to delete games:`, err.message);
      }
    }

    // Delete club_members
    try {
      await pokerDb.delete('club_members', { club_id: burrfriendsClubId });
      console.log('✓ Deleted club_members entries');
    } catch (err: any) {
      console.error('✗ Failed to delete club_members:', err.message);
    }

    // Finally, delete the club
    try {
      await pokerDb.delete('clubs', { id: burrfriendsClubId });
      console.log('✓ Deleted Burrfriends club');
    } catch (err: any) {
      console.error('✗ Failed to delete club:', err.message);
    }

    console.log('\n✓ Burrfriends cleanup complete');
  } catch (error: any) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

// ESM-safe: Always call main function when script is executed directly
cleanupBurrfriends()
  .then(() => {
    console.log('Cleanup script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup script failed:', error);
    process.exit(1);
  });

