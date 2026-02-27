import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isGlobalAdmin } from "~/lib/permissions";
import { blockUser, getAllBlockedUsers } from "~/lib/userBlocks";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

// Burr's FID for fetching his blocked list
const BURR_FID = 311933;

interface BurrBlock {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
}

interface PreviewResponse {
  blocks: BurrBlock[];
  totalCount: number;
  alreadyBlocked: number;
  newToBlock: number;
}

interface ImportResponse {
  imported: number;
  skipped: number;
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
          display_name: block.blocked.display_name,
          pfp_url: block.blocked.pfp_url || block.blocked.pfp?.url,
        });
      }
    }

    cursor = data.next?.cursor;
  } while (cursor);

  return allBlocks;
}

/**
 * GET /api/admin/burr-blocks
 * Preview Burr's blocked list (shows new vs already blocked)
 * 
 * Phase 20: Enhanced Blocklist System
 */
export async function GET(req: NextRequest) {
  try {
    // SAFETY: Require authentication
    const { fid } = await requireAuth(req);

    // SAFETY: Only global admins can view Burr's blocks
    if (!isGlobalAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only global admins can view Burr's blocks" },
        { status: 403 }
      );
    }

    // Fetch Burr's blocks from Neynar
    const burrBlocks = await fetchBurrBlocks();
    
    // Get existing app blocklist
    const existingBlocks = await getAllBlockedUsers();
    const existingFids = new Set(existingBlocks.map(b => b.fid));

    // Calculate stats
    let alreadyBlocked = 0;
    let newToBlock = 0;
    
    for (const block of burrBlocks) {
      if (existingFids.has(block.fid)) {
        alreadyBlocked++;
      } else {
        newToBlock++;
      }
    }

    return NextResponse.json<ApiResponse<PreviewResponse>>({
      ok: true,
      data: {
        blocks: burrBlocks,
        totalCount: burrBlocks.length,
        alreadyBlocked,
        newToBlock,
      },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[admin/burr-blocks] GET error', { error: error.message });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch Burr's blocks" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/burr-blocks
 * Import Burr's blocks to app blocklist
 * 
 * Phase 20: Enhanced Blocklist System
 */
export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication
    const { fid } = await requireAuth(req);

    // SAFETY: Only global admins can import blocks
    if (!isGlobalAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only global admins can import Burr's blocks" },
        { status: 403 }
      );
    }

    // Fetch Burr's blocks from Neynar
    const burrBlocks = await fetchBurrBlocks();
    
    // Get existing app blocklist
    const existingBlocks = await getAllBlockedUsers();
    const existingFids = new Set(existingBlocks.map(b => b.fid));

    let imported = 0;
    let skipped = 0;

    // Import new blocks
    for (const block of burrBlocks) {
      if (existingFids.has(block.fid)) {
        skipped++;
      } else {
        try {
          await blockUser(block.fid, BURR_FID, 'Auto-imported from Burr');
          imported++;
        } catch (err) {
          safeLog('warn', '[admin/burr-blocks] Failed to block user', { fid: block.fid, error: (err as Error).message });
          skipped++;
        }
      }
    }

    safeLog('info', '[admin/burr-blocks] Import complete', { imported, skipped, total: burrBlocks.length });

    return NextResponse.json<ApiResponse<ImportResponse>>({
      ok: true,
      data: { imported, skipped },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[admin/burr-blocks] POST error', { error: error.message });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to import Burr's blocks" },
      { status: 500 }
    );
  }
}
