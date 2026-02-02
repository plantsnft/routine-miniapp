/**
 * Verify Phase 2 Completion
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Load environment variables
const envPath = join(projectRoot, '.env.local');
let SUPABASE_URL = '';
let SUPABASE_SERVICE_ROLE = '';

try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      if (key.trim() === 'NEXT_PUBLIC_SUPABASE_URL' || key.trim() === 'SUPABASE_URL') {
        SUPABASE_URL = value.trim();
      }
      if (key.trim() === 'SUPABASE_SERVICE_ROLE') {
        SUPABASE_SERVICE_ROLE = value.trim();
      }
    }
  });
} catch (error) {
  console.error('Could not read .env.local');
  process.exit(1);
}

const headers = {
  'apikey': SUPABASE_SERVICE_ROLE,
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
  'Accept-Profile': 'basketball',
  'Content-Profile': 'basketball',
};

console.log('🔍 Verifying Phase 2 Completion\n');

// Check season_state
const stateResponse = await fetch(`${SUPABASE_URL}/rest/v1/season_state?select=*&limit=1`, { headers });
const stateData = await stateResponse.json();
const state = stateData[0];

console.log('✅ Season State:');
console.log(`   Season: ${state.season_number}, Day: ${state.day_number}, Phase: ${state.phase}, Day Type: ${state.day_type}`);

// Check teams
const teamsResponse = await fetch(`${SUPABASE_URL}/rest/v1/teams?select=id,name,owner_profile_id&order=name`, { headers });
const teams = await teamsResponse.json();

console.log(`\n✅ Teams: ${teams.length}`);
for (const team of teams) {
  // Get profile for this team
  const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${team.owner_profile_id}&select=farcaster_fid,email&limit=1`, { headers });
  const profileData = await profileResponse.json();
  const profile = profileData[0];
  const owner = profile?.farcaster_fid ? `FID ${profile.farcaster_fid}` : profile?.email || 'Unknown';
  
  // Count players for this team
  const playersResponse = await fetch(`${SUPABASE_URL}/rest/v1/players?team_id=eq.${team.id}&select=id&limit=1000`, { headers });
  const players = await playersResponse.json();
  
  console.log(`   ${team.name}: ${players.length} players (Owner: ${owner})`);
}

// Check total players
const allPlayersResponse = await fetch(`${SUPABASE_URL}/rest/v1/players?select=id&limit=1000`, { headers });
const allPlayers = await allPlayersResponse.json();

console.log(`\n✅ Total Players: ${allPlayers.length} (Expected: 20)`);

// Verify expected team assignments
const expectedAssignments = {
  'Houston': 871872, // catwalk
  'Atlanta': 967647, // farville
  'Vegas': 318447,   // plantsnft
  'NYC': 'cpjets07@yahoo.com' // email
};

console.log('\n✅ Team Assignment Verification:');
let allCorrect = true;
for (const team of teams) {
  const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${team.owner_profile_id}&select=farcaster_fid,email&limit=1`, { headers });
  const profileData = await profileResponse.json();
  const profile = profileData[0];
  const expected = expectedAssignments[team.name];
  
  let isCorrect = false;
  if (typeof expected === 'number') {
    isCorrect = profile?.farcaster_fid === expected;
  } else {
    isCorrect = profile?.email === expected;
  }
  
  if (isCorrect) {
    console.log(`   ✓ ${team.name}: Correct owner`);
  } else {
    console.log(`   ✗ ${team.name}: Incorrect owner (Expected: ${expected}, Got: ${profile?.farcaster_fid || profile?.email})`);
    allCorrect = false;
  }
}

console.log('\n' + '='.repeat(50));
if (state.season_number === 1 && state.day_number === 1 && teams.length === 4 && allPlayers.length === 20 && allCorrect) {
  console.log('✅ Phase 2 Complete - All checks passed!');
  console.log('\nNext: Phase 3 - Verify end-to-end functionality');
} else {
  console.log('⚠️  Phase 2 may be incomplete. Check details above.');
}
