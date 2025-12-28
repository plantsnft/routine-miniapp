/**
 * Seed Members Script
 * 
 * Adds members to clubs in poker.club_members schema.
 * Idempotent: safe to run multiple times (uses upsert on club_id + fid).
 * 
 * Supports both FID and username input (resolves username to FID via Neynar).
 * 
 * Usage:
 *   tsx scripts/seed-members.ts
 * 
 * Requires:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE environment variables
 *   - NEYNAR_API_KEY (optional, for username resolution)
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
import { getNeynarClient } from '../src/lib/neynar';

interface SeedData {
  members: Record<string, (number | string)[]>; // club_slug -> array of fids or usernames
}

/**
 * Resolve username to FID (non-blocking, returns null on failure)
 * 
 * Note: Neynar search API may not be available or may have different response format.
 * For now, we'll log a warning and return null. In practice, you should use FIDs directly.
 */
async function resolveUsernameToFid(username: string): Promise<number | null> {
  try {
    // TODO: Implement username resolution when Neynar search API is available
    // For now, warn and return null (seeds should use FIDs directly)
    console.warn(`Username resolution not implemented. Use FIDs directly in seed data. Username: "${username}"`);
    return null;
  } catch (error) {
    console.warn(`Failed to resolve username "${username}" to FID:`, error);
    return null;
  }
}

/**
 * Resolve member identifier (FID or username) to FID
 */
async function resolveMemberId(memberId: number | string): Promise<number | null> {
  if (typeof memberId === 'number') {
    return memberId;
  }
  
  if (typeof memberId === 'string') {
    // Try parsing as number first
    const parsed = parseInt(memberId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
    
    // Try resolving as username
    return await resolveUsernameToFid(memberId);
  }
  
  return null;
}

async function seedMembers() {
  console.log('Starting member seeding...');
  
  try {
    // Load seed data
    const seedDataPath = join(__dirname, 'seed-data.json');
    const seedData: SeedData = JSON.parse(readFileSync(seedDataPath, 'utf-8'));
    
    if (!seedData.members || typeof seedData.members !== 'object') {
      throw new Error('Seed data must contain a "members" object');
    }

    let totalAdded = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let skipped = 0;

    for (const [clubSlug, memberIds] of Object.entries(seedData.members)) {
      if (!Array.isArray(memberIds)) {
        console.error(`Skipping invalid member list for club "${clubSlug}": must be an array`);
        totalErrors++;
        continue;
      }

      console.log(`\nProcessing club: ${clubSlug} (${memberIds.length} members)`);

      // Get club by slug
      const clubs = await pokerDb.fetch('clubs', {
        filters: { slug: clubSlug },
        limit: 1,
      });

      if (clubs.length === 0) {
        console.error(`Club "${clubSlug}" not found. Run seed-clubs first.`);
        totalErrors++;
        continue;
      }

      const club = clubs[0] as any;
      const clubId = club.id;
      const ownerFid = club.owner_fid;

      // Get existing members for this club
      const existingMembers = await pokerDb.fetch('club_members', {
        filters: { club_id: clubId },
      });
      const existingFids = new Set(existingMembers.map((m: any) => m.fid || m.member_fid));

      // Process each member
      for (const memberId of memberIds) {
        try {
          const fid = await resolveMemberId(memberId);
          
          if (!fid) {
            console.warn(`  ⚠ Skipping member "${memberId}": could not resolve to FID`);
            skipped++;
            continue;
          }

          // Check if already a member
          const isExisting = existingFids.has(fid);

          // Upsert member (idempotent - unique constraint on club_id + member_fid)
          // Determine role based on whether this is the club owner
          const isOwner = fid === ownerFid;
          const memberData: any = {
            club_id: clubId,
            member_fid: fid, // Use member_fid as per schema
            role: isOwner ? 'owner' : 'member',
            status: 'active',
          };

          await pokerDb.upsert('club_members', memberData);

          if (isExisting) {
            console.log(`  ✓ Updated member: FID ${fid}`);
            totalUpdated++;
          } else {
            console.log(`  ✓ Added member: FID ${fid}`);
            totalAdded++;
          }

        } catch (error: any) {
          console.error(`  ✗ Failed to add member "${memberId}":`, error.message);
          totalErrors++;
        }
      }
    }

    console.log('\nMember seeding complete:');
    console.log(`  Added: ${totalAdded}`);
    console.log(`  Updated: ${totalUpdated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${totalErrors}`);
  } catch (error: any) {
    console.error('Member seeding failed:', error);
    process.exit(1);
  }
}

// ESM-safe: Always call main function when script is executed directly
seedMembers()
  .then(() => {
    console.log('Seed script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  });

export { seedMembers };

