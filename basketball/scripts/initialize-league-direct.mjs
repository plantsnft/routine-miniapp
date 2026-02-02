/**
 * Phase 2: League Initialization Script
 * 
 * This script calls the /api/admin/initialize endpoint to initialize the league.
 * 
 * Prerequisites:
 * - Phase 1 complete: All 4 profiles must exist
 * - Season state must be: season_number = 0, day_number = 1
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Load environment variables from .env.local
const envPath = join(projectRoot, '.env.local');
let APP_URL = 'https://basketball-kohl.vercel.app';

try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      if (key.trim() === 'NEXT_PUBLIC_BASE_URL') {
        APP_URL = value.trim();
      }
    }
  });
} catch (error) {
  console.log('Using default APP_URL');
}

const INITIALIZE_URL = `${APP_URL}/api/admin/initialize`;

console.log('🚀 Phase 2: League Initialization');
console.log(`📍 Calling: ${INITIALIZE_URL}`);
console.log('');

try {
  const response = await fetch(INITIALIZE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Initialization failed:');
    console.error(`   Status: ${response.status}`);
    console.error(`   Error: ${result.error || result.message || 'Unknown error'}`);
    process.exit(1);
  }

  if (result.ok) {
    console.log('✅ League initialized successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Profiles: ${result.data?.profilesCreated || 'N/A'}`);
    console.log(`   Teams: ${result.data?.teamsCreated || 'N/A'}`);
    console.log(`   Players: ${result.data?.playersCreated || 'N/A'}`);
    console.log('');
    console.log('🎉 Phase 2 complete!');
    console.log('');
    console.log('Next steps:');
    console.log('   1. Sign in as plantsnft');
    console.log('   2. Verify Vegas team appears on dashboard');
    console.log('   3. Verify admin controls are visible');
    console.log('   4. Verify 5 players appear on roster');
  } else {
    console.error('❌ Initialization returned error:');
    console.error(`   ${result.error || result.message || 'Unknown error'}`);
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Initialization failed:');
  console.error(`   ${error.message}`);
  if (error.stack) {
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
  }
  process.exit(1);
}
