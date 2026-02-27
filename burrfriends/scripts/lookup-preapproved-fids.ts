/**
 * Script to look up FIDs for pre-approved BETR GAMES users
 * Run with: npx tsx scripts/lookup-preapproved-fids.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

if (!NEYNAR_API_KEY) {
  console.error('NEYNAR_API_KEY not set');
  process.exit(1);
}

const client = new NeynarAPIClient({ apiKey: NEYNAR_API_KEY });

// 50 pre-approved usernames for BETR GAMES
const USERNAMES = [
  'tbullet.eth',
  'cellar',
  'yes2crypto.eth',
  'snoova',
  'madyak',
  'grunt',
  'burr.eth',
  'catfacts.eth',
  'pramadan.eth',
  'arob1000',
  'jerry-d',
  'tracyit',
  'reisub.eth',
  'taliskye',
  'sardius',
  'tatiansa.eth',
  'blueflame',
  'jabo5779',
  'mikos32.eth',
  'pixahead.eth',
  'plantsnft',
  'pelicia',
  'listen2mm.eth',
  'leovido.eth',
  'aqueous',
  'habitforming',
  'dflory3',
  'nycaakash',
  'mariabazooka',
  'ramsey',
  'gorikfr',
  'hazardzista',
  'itsbasil',
  'mvr',
  'chronist',
  'qt',
  'cav4lier',
  '6bazinga',
  'esdotge',
  'lazyfrank',
  'based-eth-ryan',
  'cryptomantis',
  'warpc0st',
  'mangkarones',
  '3olo',
  'poet.base.eth',
  'commstark',
  'bind',
  'logonaut.eth',
  'nhp',
];

async function lookupFids() {
  console.log('Looking up FIDs for', USERNAMES.length, 'usernames...\n');
  
  const results: { username: string; fid: number | null }[] = [];
  const fidList: number[] = [];
  
  // Process in batches of 10 to avoid rate limits
  for (let i = 0; i < USERNAMES.length; i += 10) {
    const batch = USERNAMES.slice(i, i + 10);
    console.log(`Processing batch ${Math.floor(i/10) + 1}/${Math.ceil(USERNAMES.length/10)}...`);
    
    for (const username of batch) {
      try {
        const response = await client.lookupUserByUsername({ username });
        if (response?.user?.fid) {
          results.push({ username, fid: response.user.fid });
          fidList.push(response.user.fid);
          console.log(`  ✓ ${username} = ${response.user.fid}`);
        } else {
          results.push({ username, fid: null });
          console.log(`  ✗ ${username} = NOT FOUND`);
        }
      } catch (err: any) {
        results.push({ username, fid: null });
        console.log(`  ✗ ${username} = ERROR: ${err.message}`);
      }
    }
    
    // Small delay between batches
    if (i + 10 < USERNAMES.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  console.log('\n--- RESULTS ---\n');
  console.log('Found', fidList.length, 'of', USERNAMES.length, 'FIDs\n');
  
  // Output as TypeScript constant
  console.log('// Add to src/lib/constants.ts:');
  console.log('export const BETR_GAMES_PRE_APPROVED_FIDS: number[] = [');
  for (const r of results) {
    if (r.fid) {
      console.log(`  ${r.fid}, // ${r.username}`);
    }
  }
  console.log('];');
  
  // List any not found
  const notFound = results.filter(r => !r.fid);
  if (notFound.length > 0) {
    console.log('\n// NOT FOUND:');
    for (const r of notFound) {
      console.log(`// - ${r.username}`);
    }
  }
}

lookupFids().catch(console.error);
