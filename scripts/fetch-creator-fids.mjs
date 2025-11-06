#!/usr/bin/env node

/**
 * Script to fetch FIDs for Catwalk creator usernames
 * Usage: node scripts/fetch-creator-fids.mjs
 */

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
    // Try Farcaster names API first
    const response = await fetch(
      `https://fnames.farcaster.xyz/transfers/current?name=${encodeURIComponent(username)}`
    );
    
    if (response.ok) {
      const data = await response.json();
      // Check different possible response structures
      const fid = data?.transfers?.[0]?.to || data?.to || data?.fid;
      
      if (fid) {
        return { username, fid: parseInt(fid, 10), success: true, source: 'fnames' };
      }
    }
    
    // Try Neynar API as fallback (requires API key)
    const neynarKey = process.env.NEYNAR_API_KEY;
    if (neynarKey) {
      try {
        const neynarResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(username)}`,
          {
            headers: {
              'x-api-key': neynarKey,
            },
          }
        );
        
        if (neynarResponse.ok) {
          const neynarData = await neynarResponse.json();
          const fid = neynarData?.result?.user?.fid;
          
          if (fid) {
            return { username, fid: parseInt(fid, 10), success: true, source: 'neynar' };
          }
        }
      } catch (neynarError) {
        // Fall through to error
      }
    }
    
    throw new Error('No FID found');
  } catch (error) {
    return { username, error: error.message, success: false };
  }
}

async function main() {
  console.log('Fetching FIDs for', CREATOR_USERNAMES.length, 'creators...\n');
  
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
  
  const fids = successful.map(r => r.fid).filter(Boolean);
  
  console.log('\n📋 FIDs array for constants.ts:');
  console.log(JSON.stringify(fids, null, 2));
  
  console.log('\n📋 Formatted for TypeScript:');
  console.log(`export const CATWALK_CREATOR_FIDS: number[] = [`);
  fids.forEach((fid, i) => {
    const comma = i < fids.length - 1 ? ',' : '';
    console.log(`  ${fid}${comma}`);
  });
  console.log(`];`);
}

main().catch(console.error);

