/**
 * Migrate Club Rebrand Script
 * 
 * Updates the existing "hellfire" club to "sias-poker-room" with new branding.
 * This script:
 * 1. Finds the existing "hellfire" club
 * 2. Updates slug, name, and description
 * 3. Ensures both owners (318447 and 273708) are in club_members
 * 
 * Usage:
 *   tsx scripts/migrate-club-rebrand.ts
 * 
 * Requires:
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) environment variable
 *   - SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY) environment variable
 */

import { pokerDb } from '../src/lib/pokerDb';
import { HELLFIRE_CLUB_SLUG, HELLFIRE_CLUB_NAME, HELLFIRE_CLUB_DESCRIPTION } from '../src/lib/constants';

// Owner FIDs for SIAs Poker Room
const OWNER_FIDS = [318447, 273708]; // Tormental and siadude

async function migrateClubRebrand() {
  console.log('Starting club rebrand migration...');
  console.log(`Target: ${HELLFIRE_CLUB_SLUG} (${HELLFIRE_CLUB_NAME})`);
  
  try {
    // Step 1: Find existing "hellfire" club
    console.log('\n1. Looking for existing "hellfire" club...');
    const oldClub = await pokerDb.fetch('clubs', {
      filters: { slug: 'hellfire' },
      limit: 1,
    });

    if (oldClub.length === 0) {
      console.log('   No existing "hellfire" club found. Checking for new slug...');
      
      // Check if new club already exists
      const newClub = await pokerDb.fetch('clubs', {
        filters: { slug: HELLFIRE_CLUB_SLUG },
        limit: 1,
      });

      if (newClub.length > 0) {
        console.log(`   ✓ Club "${HELLFIRE_CLUB_SLUG}" already exists. Updating members...`);
        await updateClubMembers(newClub[0].id);
        console.log('\n✅ Migration complete: Club already has new branding');
        return;
      } else {
        console.log('   No existing club found. You may need to run seed-clubs.ts first.');
        console.log('   Or the club may have been deleted. Exiting.');
        process.exit(0);
      }
    }

    const club = oldClub[0] as any;
    const clubId = club.id;
    console.log(`   ✓ Found club: ${club.name} (ID: ${clubId})`);

    // Step 2: Update club slug, name, and description
    console.log('\n2. Updating club information...');
    const updatedClub = await pokerDb.upsert('clubs', {
      id: clubId,
      slug: HELLFIRE_CLUB_SLUG,
      name: HELLFIRE_CLUB_NAME,
      description: HELLFIRE_CLUB_DESCRIPTION,
      owner_fid: club.owner_fid, // Keep existing owner_fid (318447)
      // Keep other fields unchanged
      clubgg_club_id: club.clubgg_club_id,
    } as any);

    console.log(`   ✓ Updated club to: ${HELLFIRE_CLUB_NAME} (slug: ${HELLFIRE_CLUB_SLUG})`);

    // Step 3: Ensure both owners are in club_members
    console.log('\n3. Updating club members...');
    await updateClubMembers(clubId);

    console.log('\n✅ Migration complete!');
    console.log(`   Club: ${HELLFIRE_CLUB_NAME}`);
    console.log(`   Slug: ${HELLFIRE_CLUB_SLUG}`);
    console.log(`   Owners: ${OWNER_FIDS.join(', ')}`);
    
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

async function updateClubMembers(clubId: string) {
  let added = 0;
  let updated = 0;

  for (const ownerFid of OWNER_FIDS) {
    try {
      // Check if member already exists
      const existing = await pokerDb.fetch('club_members', {
        filters: { club_id: clubId, member_fid: ownerFid },
        limit: 1,
      });

      // Upsert member with owner role
      await pokerDb.upsert('club_members', {
        club_id: clubId,
        member_fid: ownerFid,
        role: 'owner',
        status: 'active',
      } as any);

      if (existing.length > 0) {
        console.log(`   ✓ Updated member: FID ${ownerFid} (owner)`);
        updated++;
      } else {
        console.log(`   ✓ Added member: FID ${ownerFid} (owner)`);
        added++;
      }
    } catch (error: any) {
      console.error(`   ✗ Failed to update member FID ${ownerFid}:`, error.message);
    }
  }

  console.log(`   Summary: ${added} added, ${updated} updated`);
}

// Run migration
migrateClubRebrand()
  .then(() => {
    console.log('\nMigration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration script failed:', error);
    process.exit(1);
  });

export { migrateClubRebrand };
