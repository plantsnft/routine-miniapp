/**
 * Verify Phase 2 Implementation Against SoT Requirements
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

console.log('🔍 Verifying Phase 2 Against SoT Requirements\n');
console.log('='.repeat(60));

let allPassed = true;

// SoT Section 10 Requirements
console.log('\n📋 SoT Section 10: Initial Accounts / Teams\n');

// 1. Check profiles
console.log('1. Profiles (4 required):');
const profilesResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=farcaster_fid`, { headers });
const profiles = await profilesResponse.json();

if (profiles.length !== 4) {
  console.log(`   ❌ Expected 4 profiles, found ${profiles.length}`);
  allPassed = false;
} else {
  console.log(`   ✅ 4 profiles found`);
  
  const expectedFIDs = [871872, 967647, 318447];
  const expectedEmail = 'cpjets07@yahoo.com';
  
  for (const profile of profiles) {
    if (profile.farcaster_fid) {
      if (expectedFIDs.includes(profile.farcaster_fid)) {
        console.log(`   ✅ FID ${profile.farcaster_fid} (is_admin: ${profile.is_admin})`);
      } else {
        console.log(`   ⚠️  Unexpected FID: ${profile.farcaster_fid}`);
      }
    } else if (profile.email === expectedEmail) {
      console.log(`   ✅ Email: ${profile.email} (is_admin: ${profile.is_admin})`);
    }
    
    if (!profile.is_admin) {
      console.log(`   ❌ Profile ${profile.farcaster_fid || profile.email} is not admin`);
      allPassed = false;
    }
  }
}

// 2. Check teams
console.log('\n2. Teams (4 required with correct names and owners):');
const teamsResponse = await fetch(`${SUPABASE_URL}/rest/v1/teams?select=id,name,owner_profile_id&order=name`, { headers });
const teams = await teamsResponse.json();

const expectedTeamNames = ['Atlanta', 'Houston', 'NYC', 'Vegas'];
const teamNames = teams.map(t => t.name).sort();

if (teams.length !== 4) {
  console.log(`   ❌ Expected 4 teams, found ${teams.length}`);
  allPassed = false;
} else {
  console.log(`   ✅ 4 teams found`);
  
  for (const team of teams) {
    if (!expectedTeamNames.includes(team.name)) {
      console.log(`   ❌ Unexpected team name: ${team.name}`);
      allPassed = false;
    } else {
      console.log(`   ✅ ${team.name}`);
    }
  }
}

// 3. Check team assignments
console.log('\n3. Team Assignments (per SoT order):');
const expectedAssignments = {
  'Houston': 871872, // catwalk
  'Atlanta': 967647, // farville
  'Vegas': 318447,   // plantsnft
  'NYC': 'cpjets07@yahoo.com' // email
};

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
    console.log(`   ✅ ${team.name} → ${expected}`);
  } else {
    console.log(`   ❌ ${team.name} → Expected ${expected}, got ${profile?.farcaster_fid || profile?.email}`);
    allPassed = false;
  }
}

// 4. Check players
console.log('\n4. Players (20 required: 5 per team, 1 Elite + 1 Great + 3 Good per team):');
const playersResponse = await fetch(`${SUPABASE_URL}/rest/v1/players?select=id,team_id,name,position,tier,rating,age,affinity,salary_m,contract_years_remaining`, { headers });
const players = await playersResponse.json();

if (players.length !== 20) {
  console.log(`   ❌ Expected 20 players, found ${players.length}`);
  allPassed = false;
} else {
  console.log(`   ✅ 20 players found`);
  
  // Check per team
  for (const team of teams) {
    const teamPlayers = players.filter(p => p.team_id === team.id);
    
    if (teamPlayers.length !== 5) {
      console.log(`   ❌ ${team.name}: Expected 5 players, found ${teamPlayers.length}`);
      allPassed = false;
      continue;
    }
    
    // Check tier distribution
    const elite = teamPlayers.filter(p => p.tier === 'elite').length;
    const great = teamPlayers.filter(p => p.tier === 'great').length;
    const good = teamPlayers.filter(p => p.tier === 'good').length;
    
    if (elite !== 1 || great !== 1 || good !== 3) {
      console.log(`   ❌ ${team.name}: Tier distribution incorrect (Elite: ${elite}, Great: ${great}, Good: ${good})`);
      allPassed = false;
    } else {
      console.log(`   ✅ ${team.name}: 5 players (1 Elite, 1 Great, 3 Good)`);
    }
    
    // Check positions
    const positions = teamPlayers.map(p => p.position);
    const expectedPositions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const hasAllPositions = expectedPositions.every(pos => positions.includes(pos));
    
    if (!hasAllPositions) {
      console.log(`   ❌ ${team.name}: Missing positions. Got: ${positions.join(', ')}`);
      allPassed = false;
    } else {
      console.log(`      Positions: ${positions.join(', ')}`);
    }
    
    // Check affinities
    const affinities = teamPlayers.map(p => p.affinity);
    const hasValidAffinities = affinities.every(a => a === 'StrongVsZone' || a === 'StrongVsMan');
    
    if (!hasValidAffinities) {
      console.log(`   ❌ ${team.name}: Invalid affinities`);
      allPassed = false;
    }
    
    // Check salaries (SoT Section 4)
    for (const player of teamPlayers) {
      const expectedSalary = player.tier === 'elite' ? 20 : player.tier === 'great' ? 15 : 8;
      if (player.salary_m !== expectedSalary) {
        console.log(`   ❌ ${team.name} - ${player.name}: Expected salary ${expectedSalary}, got ${player.salary_m}`);
        allPassed = false;
      }
    }
    
    // Check contracts (SoT Section 4: 3-year contracts)
    for (const player of teamPlayers) {
      if (player.contract_years_remaining !== 3) {
        console.log(`   ❌ ${team.name} - ${player.name}: Expected contract 3 years, got ${player.contract_years_remaining}`);
        allPassed = false;
      }
    }
  }
  
  // Check player names (UVA 1980-1986, no duplicates)
  const playerNames = players.map(p => p.name);
  const uniqueNames = new Set(playerNames);
  if (uniqueNames.size !== playerNames.length) {
    console.log(`   ❌ Duplicate player names found`);
    allPassed = false;
  } else {
    console.log(`   ✅ All player names are unique (${uniqueNames.size} names)`);
  }
}

// 5. Check season state
console.log('\n5. Season State:');
const stateResponse = await fetch(`${SUPABASE_URL}/rest/v1/season_state?select=*&limit=1`, { headers });
const stateData = await stateResponse.json();
const state = stateData[0];

if (state.season_number !== 1 || state.day_number !== 1 || state.phase !== 'REGULAR' || state.day_type !== 'OFFDAY') {
  console.log(`   ❌ Season state incorrect:`);
  console.log(`      Expected: season=1, day=1, phase=REGULAR, day_type=OFFDAY`);
  console.log(`      Got: season=${state.season_number}, day=${state.day_number}, phase=${state.phase}, day_type=${state.day_type}`);
  allPassed = false;
} else {
  console.log(`   ✅ Season state: Season ${state.season_number}, Day ${state.day_number}, ${state.phase}, ${state.day_type}`);
}

// 6. Check stats records
console.log('\n6. Initial Stats Records:');
const teamStatsResponse = await fetch(`${SUPABASE_URL}/rest/v1/team_season_stats?season_number=eq.1&select=team_id&limit=100`, { headers });
const teamStats = await teamStatsResponse.json();

if (teamStats.length !== 4) {
  console.log(`   ❌ Expected 4 team_season_stats records, found ${teamStats.length}`);
  allPassed = false;
} else {
  console.log(`   ✅ 4 team_season_stats records for season 1`);
}

const playerStatsResponse = await fetch(`${SUPABASE_URL}/rest/v1/player_season_stats?season_number=eq.1&select=player_id&limit=100`, { headers });
const playerStats = await playerStatsResponse.json();

if (playerStats.length !== 20) {
  console.log(`   ❌ Expected 20 player_season_stats records, found ${playerStats.length}`);
  allPassed = false;
} else {
  console.log(`   ✅ 20 player_season_stats records for season 1`);
}

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('\n✅ ALL SoT REQUIREMENTS MET - Phase 2 Implementation is Correct!');
} else {
  console.log('\n❌ SOME REQUIREMENTS NOT MET - Review issues above');
  process.exit(1);
}
