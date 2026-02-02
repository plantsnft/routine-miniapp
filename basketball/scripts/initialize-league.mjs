/**
 * Phase 2: League Initialization Script
 * 
 * This script calls the /api/admin/initialize endpoint to:
 * - Create 4 teams (Houston, Atlanta, Vegas, NYC)
 * - Create 20 players (5 per team)
 * - Update season_state to season 1, day 1
 * - Create initial stats records
 * 
 * Prerequisites:
 * - Phase 1 complete: All 4 profiles must exist
 * - Season state must be: season_number = 0, day_number = 1
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Load environment variables from .env.local
const envPath = join(projectRoot, '.env.local');
let envVars = {};
try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      envVars[key.trim()] = value.trim();
    }
  });
} catch (error) {
  console.error('Warning: Could not read .env.local, using process.env');
}

// Get app URL from env or use default
const APP_URL = envVars.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://basketball-kohl.vercel.app';
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
  console.error('❌ Failed to call initialize endpoint:');
  console.error(`   ${error.message}`);
  console.error('');
  console.error('Troubleshooting:');
  console.error('   1. Ensure the app is deployed and accessible');
  console.error('   2. Check that NEXT_PUBLIC_BASE_URL is correct in .env.local');
  console.error('   3. Try calling the endpoint manually from the dashboard');
  process.exit(1);
}
