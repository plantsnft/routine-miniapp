import { NextResponse } from "next/server";
import { blockUser, getAllBlockedUsers } from "~/lib/userBlocks";
import { safeLog } from "~/lib/redaction";

// Burr's FID for fetching his blocked list
const BURR_FID = 311933;

interface BurrBlock {
  fid: number;
  username?: string;
}

/**
 * Fetch Burr's blocked list from Neynar
 */
async function fetchBurrBlocks(): Promise<BurrBlock[]> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    throw new Error('NEYNAR_API_KEY not configured');
  }

  const allBlocks: BurrBlock[] = [];
  let cursor: string | undefined;
  
  // Paginate through all blocks
  do {
    const url = new URL('https://api.neynar.com/v2/farcaster/block/list');
    url.searchParams.set('blocker_fid', String(BURR_FID));
    url.searchParams.set('limit', '100');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Neynar API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;
    const blocks = data.blocks || [];
    
    for (const block of blocks) {
      if (block.blocked?.fid) {
        allBlocks.push({
          fid: block.blocked.fid,
          username: block.blocked.username,
        });
      }
    }

    cursor = data.next?.cursor;
  } while (cursor);

  return allBlocks;
}

/**
 * Cron endpoint to sync Burr's Farcaster blocks to app blocklist
 * GET /api/cron/sync-burr-blocks
 * 
 * Runs daily at 2 AM UTC (configured in vercel.json)
 * 
 * Security: Verifies x-vercel-cron header or CRON_SECRET
 * 
 * Phase 20: Enhanced Blocklist System
 */
export async function GET(_req: Request) {
  // Security: Verify this is a legitimate cron request
  const cronHeader = _req.headers.get('x-vercel-cron');
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = _req.headers.get('authorization')?.replace('Bearer ', '');
  
  // Allow if Vercel cron header is present OR if CRON_SECRET matches
  if (!cronHeader && (!cronSecret || providedSecret !== cronSecret)) {
    console.warn("[Cron Sync Burr Blocks] Unauthorized cron request");
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let imported = 0;
  let skipped = 0;
  let error: string | null = null;

  try {
    // Fetch Burr's blocks from Neynar
    const burrBlocks = await fetchBurrBlocks();
    
    // Get existing app blocklist
    const existingBlocks = await getAllBlockedUsers();
    const existingFids = new Set(existingBlocks.map(b => b.fid));

    // Import new blocks
    for (const block of burrBlocks) {
      if (existingFids.has(block.fid)) {
        skipped++;
      } else {
        try {
          await blockUser(block.fid, BURR_FID, 'Auto-imported from Burr');
          imported++;
          safeLog('info', '[Cron Sync Burr Blocks] Blocked new user', { fid: block.fid, username: block.username });
        } catch (err) {
          safeLog('warn', '[Cron Sync Burr Blocks] Failed to block user', { fid: block.fid, error: (err as Error).message });
          skipped++;
        }
      }
    }

    safeLog('info', '[Cron Sync Burr Blocks] Sync complete', { 
      imported, 
      skipped, 
      totalBurrBlocks: burrBlocks.length,
      existingAppBlocks: existingBlocks.length 
    });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    safeLog('error', '[Cron Sync Burr Blocks] Sync failed', { error });
  }

  // Return HTTP 200 even on errors (as per cron best practices)
  return NextResponse.json({
    ok: !error,
    imported,
    skipped,
    error,
    syncedAt: new Date().toISOString(),
  }, { status: 200 });
}
