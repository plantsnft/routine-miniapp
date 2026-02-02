/**
 * Reset Basketball App Data
 * 
 * This script deletes all game data, players, teams, and stats
 * to prepare for historical mode implementation.
 * 
 * WARNING: This will delete all existing data!
 * 
 * Usage: node scripts/reset-data.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function resetData() {
  console.log('🔄 Starting data reset...\n');

  try {
    // Delete in order (respecting foreign key constraints)
    
    console.log('1. Deleting game_player_lines...');
    const { error: gplError } = await supabase
      .from('game_player_lines')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    if (gplError) throw gplError;
    console.log('   ✅ Deleted game_player_lines');

    console.log('2. Deleting games...');
    const { error: gamesError } = await supabase
      .from('games')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (gamesError) throw gamesError;
    console.log('   ✅ Deleted games');

    console.log('3. Deleting player_season_stats...');
    const { error: pssError } = await supabase
      .from('player_season_stats')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (pssError) throw pssError;
    console.log('   ✅ Deleted player_season_stats');

    console.log('4. Deleting team_season_stats...');
    const { error: tssError } = await supabase
      .from('team_season_stats')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (tssError) throw tssError;
    console.log('   ✅ Deleted team_season_stats');

    console.log('5. Deleting offday_actions...');
    const { error: oaError } = await supabase
      .from('offday_actions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (oaError) throw oaError;
    console.log('   ✅ Deleted offday_actions');

    console.log('6. Deleting gameplans...');
    const { error: gpError } = await supabase
      .from('gameplans')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (gpError) throw gpError;
    console.log('   ✅ Deleted gameplans');

    console.log('7. Deleting players...');
    const { error: playersError } = await supabase
      .from('players')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (playersError) throw playersError;
    console.log('   ✅ Deleted players');

    console.log('8. Deleting teams...');
    const { error: teamsError } = await supabase
      .from('teams')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (teamsError) throw teamsError;
    console.log('   ✅ Deleted teams');

    console.log('9. Resetting season_state...');
    const { error: stateError } = await supabase
      .from('season_state')
      .update({
        season_number: 1,
        day_number: 1,
        phase: 'REGULAR',
        day_type: 'OFFDAY',
        last_advanced_at: null,
      })
      .eq('id', 1);
    if (stateError) throw stateError;
    console.log('   ✅ Reset season_state');

    // Note: We keep profiles - users don't need to re-register

    console.log('\n✅ Data reset complete!');
    console.log('   - All games, players, teams, and stats deleted');
    console.log('   - Season state reset to Season 1, Day 1, OFFDAY');
    console.log('   - Profiles preserved (users can still log in)');
    console.log('\n📝 Next steps:');
    console.log('   1. Run database migration: supabase_migration_historical_mode.sql');
    console.log('   2. Run MaxPreps scraping script');
    console.log('   3. Initialize league with historical data');

  } catch (error) {
    console.error('❌ Error resetting data:', error);
    process.exit(1);
  }
}

resetData();
