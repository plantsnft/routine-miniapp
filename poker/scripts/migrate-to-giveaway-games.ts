/**
 * Migration Script: Update club from "hellfire" to "giveaway-games"
 * 
 * This script updates the existing club record in the database:
 * - Changes slug from "hellfire" to "giveaway-games"
 * - Updates name and description
 * - Keeps all other fields (id, owner_fid, etc.) unchanged
 * 
 * SAFETY: Games reference clubs by UUID (club_id), not slug, so updating
 * the slug won't break any relationships. All existing games remain linked.
 * 
 * Usage:
 *   tsx scripts/migrate-to-giveaway-games.ts
 * 
 * Requires:
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) environment variable
 *   - SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY) environment variable
 * 
 * Automatically loads .env.local if it exists
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local if it exists
try {
  const envPath = join(__dirname, '..', '.env.local');
  const envFile = readFileSync(envPath, 'utf-8');
  const envLines = envFile.split(/\r?\n/); // Handle both \n and \r\n
  
  for (const line of envLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        // Always set (overwrite if exists) to ensure latest values
        process.env[key] = cleanValue;
      }
    }
  }
  
  // Ensure SUPABASE_URL is set from NEXT_PUBLIC_SUPABASE_URL if needed
  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  
  // Ensure SUPABASE_SERVICE_ROLE is set from SUPABASE_SERVICE_ROLE_KEY if needed
  if (!process.env.SUPABASE_SERVICE_ROLE && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  
  console.log('✓ Loaded environment variables from .env.local');
  console.log(`   process.env.SUPABASE_URL: ${process.env.SUPABASE_URL ? `"${process.env.SUPABASE_URL.substring(0, 30)}..."` : 'NOT SET'}`);
  console.log(`   process.env.NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? `"${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 30)}..."` : 'NOT SET'}`);
  if (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log('✓ SUPABASE_URL is configured\n');
  } else {
    console.warn('⚠ WARNING: SUPABASE_URL not found in .env.local\n');
  }
} catch (error: any) {
  if (error.code !== 'ENOENT') {
    console.warn('⚠ Warning: Could not load .env.local:', error.message);
  }
}

// Verify env vars are set before importing
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('\n❌ ERROR: SUPABASE_URL not found in environment!');
  console.error('   Please check your .env.local file in the poker folder has:');
  console.error('   SUPABASE_URL=https://your-supabase-url.supabase.co');
  console.error(`   Current process.env.SUPABASE_URL: "${process.env.SUPABASE_URL || '(empty)'}"`);
  console.error(`   Current process.env.NEXT_PUBLIC_SUPABASE_URL: "${process.env.NEXT_PUBLIC_SUPABASE_URL || '(empty)'}"`);
  process.exit(1);
}

if (!supabaseServiceRole) {
  console.error('\n❌ ERROR: SUPABASE_SERVICE_ROLE not found in environment!');
  console.error('   Please check your .env.local file in the poker folder has:');
  console.error('   SUPABASE_SERVICE_ROLE=your_service_role_key');
  process.exit(1);
}

// CRITICAL: Set process.env explicitly BEFORE any imports
// This ensures the values are available when constants.ts is imported
process.env.SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE = supabaseServiceRole;

// Also set NEXT_PUBLIC versions to ensure compatibility
process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;

console.log(`   Using SUPABASE_URL: ${supabaseUrl.substring(0, 40)}...\n`);

async function migrateToGiveawayGames() {
  // Import modules dynamically AFTER env vars are set
  // This is critical because constants.ts evaluates at import time
  const { pokerDb } = await import('../src/lib/pokerDb');
  const { GIVEAWAY_GAMES_CLUB_SLUG, GIVEAWAY_GAMES_CLUB_NAME, GIVEAWAY_GAMES_CLUB_DESCRIPTION } = await import('../src/lib/constants');
  
  console.log('✓ Modules loaded with correct environment variables\n');
  console.log('Starting migration to Giveaway Games...\n');
  
  try {
    // 1. Find existing club with old slug
    console.log('1. Looking for existing "hellfire" club...');
    const oldClub = await pokerDb.fetch('clubs', {
      filters: { slug: 'hellfire' },
      limit: 1,
    });

    if (oldClub.length === 0) {
      console.log('   No existing "hellfire" club found.');
      
      // Check if new club already exists
      const newClub = await pokerDb.fetch('clubs', {
        filters: { slug: GIVEAWAY_GAMES_CLUB_SLUG },
        limit: 1,
      });

      if (newClub.length > 0) {
        console.log(`   ✓ Club "${GIVEAWAY_GAMES_CLUB_SLUG}" already exists. Migration may have already been run.`);
        console.log(`   Club: ${(newClub[0] as any).name} (ID: ${(newClub[0] as any).id})`);
        return;
      } else {
        console.log('   No existing club found. You may need to run seed-clubs.ts first.');
        console.log('   Exiting.');
        process.exit(0);
      }
    }

    const club = oldClub[0] as any;
    const clubId = club.id;
    console.log(`   ✓ Found club: ${club.name} (ID: ${clubId})`);
    console.log(`   Current slug: ${club.slug}`);

    // 2. Check for existing games linked to this club
    console.log('\n2. Checking for linked games...');
    const games = await pokerDb.fetch('games', {
      filters: { club_id: clubId },
      select: 'id, name',
      limit: 10, // Just check first 10
    });
    console.log(`   Found ${games.length} game(s) linked to this club (showing first 10)`);
    if (games.length > 0) {
      console.log('   Games will remain linked after migration (they reference by UUID, not slug)');
    }

    // 3. Update club record
    console.log('\n3. Updating club information...');
    await pokerDb.update('clubs', 
      { id: clubId },
      {
        slug: GIVEAWAY_GAMES_CLUB_SLUG,
        name: GIVEAWAY_GAMES_CLUB_NAME,
        description: GIVEAWAY_GAMES_CLUB_DESCRIPTION,
      } as any
    );

    console.log(`   ✓ Updated club:`);
    console.log(`     Slug: ${club.slug} → ${GIVEAWAY_GAMES_CLUB_SLUG}`);
    console.log(`     Name: ${club.name} → ${GIVEAWAY_GAMES_CLUB_NAME}`);
    console.log(`     Description: ${club.description || '(none)'} → ${GIVEAWAY_GAMES_CLUB_DESCRIPTION}`);

    // 4. Verify update
    console.log('\n4. Verifying update...');
    const updatedClub = await pokerDb.fetch('clubs', {
      filters: { id: clubId },
      limit: 1,
    });

    if (updatedClub.length === 0) {
      throw new Error('Club not found after update - something went wrong!');
    }

    const verified = updatedClub[0] as any;
    if (verified.slug !== GIVEAWAY_GAMES_CLUB_SLUG) {
      throw new Error(`Slug mismatch: expected "${GIVEAWAY_GAMES_CLUB_SLUG}", got "${verified.slug}"`);
    }

    console.log('   ✓ Verification successful!');
    console.log(`   Club ID: ${verified.id} (unchanged)`);
    console.log(`   Owner FID: ${verified.owner_fid} (unchanged)`);

    console.log('\n✅ Migration complete!');
    console.log(`   Club: ${GIVEAWAY_GAMES_CLUB_NAME}`);
    console.log(`   Slug: ${GIVEAWAY_GAMES_CLUB_SLUG}`);
    console.log(`   All ${games.length} game(s) remain linked to this club`);
    
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error);
    console.error('Error details:', error.message || String(error));
    process.exit(1);
  }
}

// ESM-safe: Always call main function when script is executed directly
migrateToGiveawayGames()
  .then(() => {
    console.log('\nMigration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });

export { migrateToGiveawayGames };
