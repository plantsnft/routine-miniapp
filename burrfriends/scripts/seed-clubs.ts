/**
 * Seed Clubs Script
 * 
 * Creates or updates clubs in poker.clubs schema.
 * Idempotent: safe to run multiple times (uses upsert on slug).
 * 
 * Usage:
 *   tsx scripts/seed-clubs.ts
 * 
 * Requires:
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) environment variable
 *   - SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY) environment variable
 *   - Seed data in scripts/seed-data.json
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import pokerDb (constants.ts handles env var fallbacks)
import { pokerDb } from '../src/lib/pokerDb';

interface ClubSeed {
  slug: string;
  name: string;
  description?: string;
  owner_fid: number;
}

interface SeedData {
  clubs: ClubSeed[];
}

async function seedClubs() {
  console.log('Starting club seeding...');
  
  try {
    // Load seed data
    const seedDataPath = join(__dirname, 'seed-data.json');
    const seedData: SeedData = JSON.parse(readFileSync(seedDataPath, 'utf-8'));
    
    if (!seedData.clubs || !Array.isArray(seedData.clubs)) {
      throw new Error('Seed data must contain a "clubs" array');
    }

    console.log(`Found ${seedData.clubs.length} clubs to seed`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const clubSeed of seedData.clubs) {
      try {
        if (!clubSeed.slug || !clubSeed.name || !clubSeed.owner_fid) {
          console.error(`Skipping invalid club: missing required fields`, clubSeed);
          errors++;
          continue;
        }

        // Check if club already exists (by slug)
        const existing = await pokerDb.fetch('clubs', {
          filters: { slug: clubSeed.slug },
          limit: 1,
        });

        const clubData: any = {
          slug: clubSeed.slug,
          name: clubSeed.name,
          description: clubSeed.description || null,
          owner_fid: clubSeed.owner_fid,
        };

        // Upsert club (idempotent - unique constraint on slug)
        const result = await pokerDb.upsert('clubs', clubData);
        const club = Array.isArray(result) ? result[0] : result;

        if (existing.length > 0) {
          console.log(`✓ Updated club: ${clubSeed.slug} (${clubSeed.name})`);
          updated++;
        } else {
          console.log(`✓ Created club: ${clubSeed.slug} (${clubSeed.name})`);
          created++;
        }

        // Ensure owner is in club_members with role='owner' (idempotent)
        await pokerDb.upsert('club_members', {
          club_id: club.id,
          member_fid: clubSeed.owner_fid,
          role: 'owner',
          status: 'active',
        } as any);

      } catch (error: any) {
        console.error(`Failed to seed club ${clubSeed.slug}:`, error.message);
        errors++;
      }
    }

    console.log('\nClub seeding complete:');
    console.log(`  Created: ${created}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Errors: ${errors}`);
  } catch (error: any) {
    console.error('Club seeding failed:', error);
    process.exit(1);
  }
}

// ESM-safe: Always call main function when script is executed directly
seedClubs()
  .then(() => {
    console.log('Seed script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  });

export { seedClubs };

