#!/usr/bin/env node

/**
 * Script to fetch FIDs for Catwalk creator usernames using Neynar API
 * and update the constants file.
 * Usage: node scripts/fetch-and-update-creator-fids.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Load environment variables from .env file
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CREATOR_USERNAMES = [
  "plantsnft",
  "amalmariei",
  "dainu",
  "ricardotakamura",
  "serendipity",
  "arfonzo.eth",
  "hammallama.eth",
  "hustletrees",
  "moonshay",
  "fabianospeziari",
  "ideas",
  "imfairydust",
  "psydeffects",
  "lovejoy",
  "mkkstacks",
  "barbarabezina",
  "stashbox",
  "breech",
  "jank88",
  "lqviolette",
  "vitaminna",
  "agustina",
  "visheh",
  "torii-stories",
  "mortezabtc.eth",
  "bluclaat",
  "librarian",
  "catwalk",
  "jelly26",
  "crunnella",
  "lifeisatape.eth"
];

async function fetchFID(username) {
  try {
    // Use Farcaster names API (same as user's PowerShell script)
    const response = await fetch(
      `https://fnames.farcaster.xyz/transfers/current?name=${encodeURIComponent(username)}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { username, error: 'Username not found (404)', success: false };
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Debug: log first response to understand structure
    if (username === CREATOR_USERNAMES[0]) {
      console.log(`\n[DEBUG] First response structure for ${username}:`, JSON.stringify(data, null, 2).substring(0, 500));
    }
    
    // Parse response structure: { transfer: { to: 318447 } }
    // The PowerShell script uses: .transfers[0].to (but it's actually .transfer.to in the response)
    if (data?.transfer?.to) {
      const fid = typeof data.transfer.to === 'string' ? parseInt(data.transfer.to, 10) : data.transfer.to;
      if (!isNaN(fid) && fid > 0) {
        return { username, fid, success: true };
      }
    }
    
    // Fallback: try transfers array (in case API structure varies)
    if (data?.transfers && Array.isArray(data.transfers) && data.transfers.length > 0) {
      const transfer = data.transfers[0];
      const fidStr = transfer?.to || transfer?.fid;
      if (fidStr) {
        const fid = typeof fidStr === 'string' ? parseInt(fidStr, 10) : fidStr;
        if (!isNaN(fid) && fid > 0) {
          return { username, fid, success: true };
        }
      }
    }
    
    return { username, error: `No FID found. Response keys: ${Object.keys(data || {}).join(', ')}`, success: false };
  } catch (error) {
    return { username, error: error.message, success: false };
  }
}

async function main() {
  console.log('Fetching FIDs for', CREATOR_USERNAMES.length, 'creators using Farcaster names API...\n');
  
  const results = await Promise.all(CREATOR_USERNAMES.map(fetchFID));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log('✅ Successful:', successful.length);
  successful.forEach(r => {
    console.log(`  ${r.username}: ${r.fid}`);
  });
  
  if (failed.length > 0) {
    console.log('\n❌ Failed:', failed.length);
    failed.forEach(r => {
      console.log(`  ${r.username}: ${r.error}`);
    });
  }
  
  const fids = successful.map(r => r.fid).filter(Boolean).sort((a, b) => a - b);
  
  if (fids.length === 0) {
    console.error('\n❌ No FIDs found. Cannot update constants file.');
    process.exit(1);
  }
  
  console.log('\n📋 FIDs to add:', fids.join(', '));
  
  // Read the constants file
  const constantsPath = join(__dirname, '..', 'src', 'lib', 'constants.ts');
  let constantsContent = readFileSync(constantsPath, 'utf-8');
  
  // Replace the CATWALK_CREATOR_FIDS array
  const fidsString = fids.map(fid => `  ${fid}`).join(',\n');
  const newArray = `export const CATWALK_CREATOR_FIDS: number[] = [\n${fidsString},\n];`;
  
  // Find and replace the existing array
  const arrayRegex = /export const CATWALK_CREATOR_FIDS: number\[\] = \[[\s\S]*?\];/;
  
  if (arrayRegex.test(constantsContent)) {
    constantsContent = constantsContent.replace(arrayRegex, newArray);
    console.log('\n✅ Updated constants.ts');
  } else {
    console.error('\n❌ Could not find CATWALK_CREATOR_FIDS in constants.ts');
    console.log('\nExpected to find:');
    console.log('export const CATWALK_CREATOR_FIDS: number[] = [...]');
    process.exit(1);
  }
  
  // Write the updated file
  writeFileSync(constantsPath, constantsContent, 'utf-8');
  
  console.log(`\n✅ Successfully updated ${constantsPath}`);
  console.log(`✅ Added ${fids.length} creator FIDs`);
  if (failed.length > 0) {
    console.log(`⚠️  ${failed.length} usernames failed - you may need to add them manually`);
  }
}

main().catch(console.error);

