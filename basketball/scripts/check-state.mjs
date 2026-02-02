/**
 * Check current league state
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

// Check state via Supabase REST API
const headers = {
  'apikey': SUPABASE_SERVICE_ROLE,
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
  'Accept-Profile': 'basketball',
  'Content-Profile': 'basketball',
};

console.log('📊 Checking league state...\n');

// Check season_state
const stateResponse = await fetch(`${SUPABASE_URL}/rest/v1/season_state?select=*&limit=1`, { headers });
const stateData = await stateResponse.json();
console.log('Season State:', stateData.length > 0 ? stateData[0] : 'None');

// Check teams
const teamsResponse = await fetch(`${SUPABASE_URL}/rest/v1/teams?select=id,name,owner_profile_id`, { headers });
const teamsData = await teamsResponse.json();
console.log(`\nTeams: ${teamsData.length}`);
teamsData.forEach(t => console.log(`  - ${t.name} (ID: ${t.id})`));

// Check players
const playersResponse = await fetch(`${SUPABASE_URL}/rest/v1/players?select=id,team_id,name&limit=5`, { headers });
const playersData = await playersResponse.json();
console.log(`\nPlayers: ${playersData.length} total (showing first 5)`);
playersData.forEach(p => console.log(`  - ${p.name} (ID: ${p.id})`));
