/**
 * Migration script: Encrypt existing plaintext game credentials
 * 
 * This script reads games with plaintext credentials (game_password_encrypted or similar)
 * and encrypts them using AES-256-GCM, storing in creds_ciphertext/creds_iv/creds_version.
 * 
 * Usage:
 *   tsx scripts/migrate-game-creds.ts
 * 
 * Requires:
 *   - POKER_CREDS_ENCRYPTION_KEY environment variable
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE environment variables
 */

import { pokerDb } from '../src/lib/pokerDb';
import { encryptCreds } from '../src/lib/crypto/credsVault';

interface GameWithPlaintext {
  id: string;
  game_password_encrypted?: string | null;
  clubgg_username?: string | null;
  clubgg_password?: string | null;
  creds_ciphertext?: string | null;
  creds_iv?: string | null;
}

async function migrateGameCredentials() {
  console.log('Starting game credentials migration...');
  
  // Check for encryption key
  if (!process.env.POKER_CREDS_ENCRYPTION_KEY) {
    throw new Error('POKER_CREDS_ENCRYPTION_KEY environment variable is required');
  }

  try {
    // Fetch all games that might have plaintext credentials
    // Note: This assumes we're looking for games with game_password_encrypted but no creds_ciphertext
    const games = await pokerDb.fetch<GameWithPlaintext>('games', {
      select: 'id,game_password_encrypted,clubgg_username,clubgg_password,creds_ciphertext,creds_iv',
    });

    console.log(`Found ${games.length} games to check`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const game of games) {
      // Skip if already encrypted
      if (game.creds_ciphertext && game.creds_iv) {
        skipped++;
        continue;
      }

      // Try to find credentials to encrypt
      let username: string | null = null;
      let password: string | null = null;

      // Check for ClubGG credentials
      if (game.clubgg_username && game.clubgg_password) {
        username = game.clubgg_username;
        password = game.clubgg_password;
      }
      // Check for legacy game_password_encrypted (base64 encoded password only)
      else if (game.game_password_encrypted) {
        // Legacy: decrypt the old base64-encoded password
        try {
          password = Buffer.from(game.game_password_encrypted, 'base64').toString('utf-8');
          // For legacy games, we don't have username, so we'll skip these
          // Or use a default/placeholder username
          console.warn(`Game ${game.id} has legacy game_password_encrypted but no username - skipping`);
          skipped++;
          continue;
        } catch (err) {
          console.error(`Game ${game.id}: Failed to decode legacy password:`, err);
          errors++;
          continue;
        }
      }

      // If we have both username and password, encrypt them
      if (username && password) {
        try {
          const encrypted = encryptCreds({ username, password });
          
          // Update game with encrypted credentials
          await pokerDb.update('games',
            { id: game.id },
            {
              creds_ciphertext: encrypted.ciphertextB64,
              creds_iv: encrypted.ivB64,
              creds_version: encrypted.version,
              // Optionally null out old plaintext fields after migration
              // game_password_encrypted: null,
              // clubgg_username: null,
              // clubgg_password: null,
            } as any
          );

          console.log(`✓ Migrated game ${game.id}`);
          migrated++;
        } catch (err) {
          console.error(`Game ${game.id}: Failed to encrypt credentials:`, err);
          errors++;
        }
      } else {
        skipped++;
      }
    }

    console.log('\nMigration complete:');
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
  } catch (error: any) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateGameCredentials()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateGameCredentials };

