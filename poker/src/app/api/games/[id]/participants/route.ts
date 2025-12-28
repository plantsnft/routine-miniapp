import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess, requireClubOwner, getClubForGame } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import type { ApiResponse, GameParticipant } from "~/lib/types";

/**
 * GET /api/games/[id]/participants
 * Get all participants for a game
 * - Club owner/admin: sees all participants
 * - Regular users: see only their own participation (MVP: open signup)
 * 
 * MVP: Open signup - any authed user can view participants (but only see their own unless admin)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 */
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // Verify game exists (no membership requirement for MVP)
    const clubId = await requireGameAccess(fid, gameId);

    // Check if user is club owner/admin (can see all participants)
    const isOwner = isGlobalAdmin(fid) || await requireClubOwner(fid, clubId).then(() => true).catch(() => false);

    // Fetch participants - use pokerDb
    // Return all participants for everyone (so all users can see who has joined)
    const filters: Record<string, string | number> = { game_id: gameId };

    console.log(`[API PARTICIPANTS] Fetching participants for game ${gameId}, user FID: ${fid}, isOwner: ${isOwner}, filters:`, filters);

    // CRITICAL: Explicitly select all fields including transaction hashes
    // NOTE: wallet_address column does not exist in schema - removed to prevent 42703 error
    const participants = await pokerDb.fetch<GameParticipant>('participants', {
      filters,
      select: 'id,game_id,fid,status,tx_hash,paid_at,refund_tx_hash,refunded_at,payout_tx_hash,payout_amount,paid_out_at,inserted_at,updated_at',
      order: 'inserted_at.desc',
    });

    // Debug logging: show distinct statuses and transaction fields
    const distinctStatuses = [...new Set(participants.map(p => p.status))];
    const debugEnabled = process.env.NEXT_PUBLIC_DEBUG_PARTICIPANTS === '1';
    if (debugEnabled) {
      console.log(`[API PARTICIPANTS][DEBUG] Game ${gameId}, total rows: ${participants.length}, distinct statuses: [${distinctStatuses.join(', ')}]`);
      console.log(`[API PARTICIPANTS][DEBUG] Sample participant fields:`, participants.length > 0 ? Object.keys(participants[0]) : []);
    }
    console.log(`[API PARTICIPANTS] Game ${gameId} returned ${participants.length} participants:`, participants.map(p => ({ 
      id: p.id, 
      game_id: (p as any).game_id, 
      fid: (p as any).fid || (p as any).player_fid,
      status: p.status,
      hasTxHash: !!(p.tx_hash),
      hasRefundTxHash: !!((p as any).refund_tx_hash),
      hasPayoutTxHash: !!((p as any).payout_tx_hash),
    })));

    // Get version for deployment verification
    const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown';

    const response = NextResponse.json<ApiResponse<GameParticipant[]>>({
      ok: true,
      data: participants,
    });
    
    response.headers.set('X-App-Version', gitSha);
    return response;
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('member') || error.message?.includes('access')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][games][participants] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch participants" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/games/[id]/participants
 * Manually add/update a participant (club owner only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireClubOwner - only club owner can manage participants
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    const body = await req.json();
    const { fid: targetFid } = body;

    if (!targetFid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing fid" },
        { status: 400 }
      );
    }

    // SAFETY: Require club ownership
    const clubId = await getClubForGame(gameId);
    if (!clubId) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }
    await requireClubOwner(fid, clubId);

    // Upsert participant - use pokerDb
    // Note: Schema only has: id, game_id, fid, status, tx_hash, paid_at, inserted_at, updated_at
    const participantData: any = {
      game_id: gameId,
      fid: parseInt(String(targetFid), 10),
      status: 'joined',
    };

    const participant = await pokerDb.upsert<GameParticipant>('participants', participantData);
    const result = Array.isArray(participant) ? participant[0] : participant;

    return NextResponse.json<ApiResponse<GameParticipant>>({
      ok: true,
      data: result,
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('owner') || error.message?.includes('permission')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][games][participants] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to update participant" },
      { status: 500 }
    );
  }
}
