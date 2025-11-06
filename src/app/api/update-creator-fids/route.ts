import { NextResponse } from 'next/server';
import { getNeynarClient } from '~/lib/neynar';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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

/**
 * API endpoint to fetch FIDs for all creators and update constants.ts
 * This is a one-time operation endpoint.
 */
export async function GET() {
  try {
    const client = getNeynarClient();
    const results: Array<{ username: string; fid?: number; error?: string }> = [];
    
    console.log(`[Update Creator FIDs] Fetching FIDs for ${CREATOR_USERNAMES.length} creators...`);
    
    // Fetch FID for each username
    for (const username of CREATOR_USERNAMES) {
      try {
        // Remove .eth suffix for lookup
        const lookupUsername = username.replace(/\.eth$/, '');
        
        const userResponse = await client.lookupUserByUsername({ username: lookupUsername });
        // Access user directly - the SDK returns User object, not wrapped
        const fid = (userResponse as any)?.user?.fid || (userResponse as any)?.fid;
        
        if (fid) {
          results.push({ username, fid });
          console.log(`[Update Creator FIDs] ✅ ${username}: ${fid}`);
        } else {
          results.push({ username, error: 'No FID found' });
          console.log(`[Update Creator FIDs] ❌ ${username}: No FID found`);
        }
      } catch (error: any) {
        // Try with full username including .eth if it failed
        if (!username.includes('.eth')) {
          results.push({ username, error: error.message || 'Unknown error' });
          console.log(`[Update Creator FIDs] ❌ ${username}: ${error.message}`);
          continue;
        }
        
        try {
          const userResponse = await client.lookupUserByUsername({ username });
          // Access user directly - the SDK returns User object, not wrapped
          const fid = (userResponse as any)?.user?.fid || (userResponse as any)?.fid;
          
          if (fid) {
            results.push({ username, fid });
            console.log(`[Update Creator FIDs] ✅ ${username}: ${fid}`);
          } else {
            results.push({ username, error: 'No FID found' });
            console.log(`[Update Creator FIDs] ❌ ${username}: No FID found`);
          }
        } catch (retryError: any) {
          results.push({ username, error: retryError.message || 'Unknown error' });
          console.log(`[Update Creator FIDs] ❌ ${username}: ${retryError.message}`);
        }
      }
    }
    
    const successful = results.filter(r => r.fid);
    const failed = results.filter(r => !r.fid);
    
    const fids = successful.map(r => r.fid!).sort((a, b) => a - b);
    
    if (fids.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No FIDs found',
        results,
      });
    }
    
    // Read and update constants file
    try {
      const constantsPath = join(process.cwd(), 'src', 'lib', 'constants.ts');
      let constantsContent = readFileSync(constantsPath, 'utf-8');
      
      const fidsString = fids.map(fid => `  ${fid}`).join(',\n');
      const newArray = `export const CATWALK_CREATOR_FIDS: number[] = [\n${fidsString},\n];`;
      
      const arrayRegex = /export const CATWALK_CREATOR_FIDS: number\[\] = \[[\s\S]*?\];/;
      
      if (arrayRegex.test(constantsContent)) {
        constantsContent = constantsContent.replace(arrayRegex, newArray);
        writeFileSync(constantsPath, constantsContent, 'utf-8');
        console.log(`[Update Creator FIDs] ✅ Updated constants.ts with ${fids.length} FIDs`);
      } else {
        return NextResponse.json({
          success: false,
          error: 'Could not find CATWALK_CREATOR_FIDS in constants.ts',
          fids,
          results,
        });
      }
    } catch (fileError: any) {
      return NextResponse.json({
        success: false,
        error: `Failed to update constants.ts: ${fileError.message}`,
        fids,
        results,
      });
    }
    
    return NextResponse.json({
      success: true,
      fids,
      count: fids.length,
      successful: successful.length,
      failed: failed.length,
      results,
    });
  } catch (error: any) {
    console.error('[Update Creator FIDs] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch creator FIDs' },
      { status: 500 }
    );
  }
}

