import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isAdmin, requireAdmin } from "~/lib/admin";
import { validateAndSanitizeGameRequestPayload, validateTxHashFormat, verifyTxHashOnChain } from "~/lib/game-request-validation";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import type { ApiResponse } from "~/lib/types";

/**
 * POST /api/game-requests
 * Create a game request (non-admin only)
 * 
 * Requires prefund_tx_hash and game payload matching create-game format
 * Admins should use /api/games directly
 */
export async function POST(req: NextRequest) {
  try {
    const correlationId = getCorrelationId(req);
    const { fid } = await requireAuth(req);
    
    // Reject if user is admin (they should use New Game)
    if (isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admins should use 'New Game' instead of requesting. This endpoint is for non-admin users only." },
        { status: 403 }
      );
    }
    
    const body = await req.json();
    const { prefund_tx_hash, payload } = body;
    
    // Validate prefund_tx_hash format (strict: 0x + 64 hex chars = 66 total)
    if (!prefund_tx_hash || typeof prefund_tx_hash !== 'string') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "prefund_tx_hash is required" },
        { status: 400 }
      );
    }
    
    if (!validateTxHashFormat(prefund_tx_hash)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "prefund_tx_hash must be a valid transaction hash: 0x followed by 64 hexadecimal characters" },
        { status: 400 }
      );
    }
    
    // Optional onchain verification (if flag enabled)
    const txExists = await verifyTxHashOnChain(prefund_tx_hash);
    if (!txExists) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Transaction hash not found on-chain. Please verify the transaction hash is correct." },
        { status: 400 }
      );
    }
    
    // Validate and sanitize payload
    let sanitizedPayload;
    try {
      sanitizedPayload = validateAndSanitizeGameRequestPayload(payload);
    } catch (validationError: any) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: validationError.message || "Invalid payload" },
        { status: 400 }
      );
    }
    
    // Block non-admins from requesting large_event games
    const gameType = sanitizedPayload.game_type === 'large_event' ? 'large_event' : 'standard';
    if (gameType === 'large_event') {
      const { isAdmin } = await import('~/lib/admin');
      if (!isAdmin(fid)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Only admins can request large_event games" },
          { status: 403 }
        );
      }
    }
    
    // Basic validation: payload should have gating_type (club_id is NOT required - server will set it)
    if (!sanitizedPayload.gating_type) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "payload must include gating_type" },
        { status: 400 }
      );
    }
    
    // Insert request (club_id will be set by server if needed, but we don't require it here)
    const requestData = {
      requester_fid: fid,
      status: 'pending',
      payload: sanitizedPayload, // Use sanitized payload
      prefund_tx_hash,
      created_game_id: null,
      approved_by_fid: null,
      rejection_reason: null,
    };
    
    const created = (await pokerDb.insert(
      'game_requests',
      requestData,
      'id'
    )) as unknown as { id: string }[];

    const requestId = created?.[0]?.id;
    if (!requestId) {
      throw new Error('Failed to create game request: no id returned');
    }
    
    // Safe logging: only log metadata, never full payload
    safeLog('info', '[game-requests] Request created', {
      correlationId,
      requestId,
      requesterFid: fid,
      payloadFieldCount: Object.keys(sanitizedPayload).length,
      hasGatingType: !!sanitizedPayload.gating_type,
      prefundTxHash: prefund_tx_hash.substring(0, 10) + '...', // Truncate for logging
    });
    
    return NextResponse.json<ApiResponse>(
      { ok: true, data: { requestId } },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    
    console.error("[API][game-requests] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to create game request" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/game-requests
 * List game requests (admin only)
 * 
 * Query params:
 * - status: filter by status (default: 'pending')
 */
export async function GET(req: NextRequest) {
  try {
    const correlationId = getCorrelationId(req);
    const { fid } = await requireAuth(req);
    
    // Admin only - enforce server-side
    requireAdmin(fid);
    
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';
    
    // Validate status
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "status must be one of: pending, approved, rejected" },
        { status: 400 }
      );
    }
    
    // Fetch requests - handle empty results gracefully
    let requests: any[] = [];
    try {
      requests = await pokerDb.fetch<any>('game_requests', {
        filters: { status },
        select: 'id,requester_fid,status,payload,prefund_tx_hash,created_game_id,approved_by_fid,rejection_reason,created_at,updated_at',
        order: 'created_at.desc',
      });
      
      // Ensure requests is an array (pokerDb.fetch should always return array, but defensive check)
      if (!Array.isArray(requests)) {
        safeLog('error', '[game-requests] Fetch returned non-array result', {
          correlationId,
          adminFid: fid,
          status,
          resultType: typeof requests,
        });
        requests = [];
      }
    } catch (fetchError: any) {
      safeLog('error', '[game-requests] Failed to fetch requests', {
        correlationId,
        adminFid: fid,
        status,
        errorCode: fetchError?.code,
        errorMessage: fetchError?.message || String(fetchError),
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: fetchError?.message || "Failed to fetch game requests" },
        { status: 500 }
      );
    }
    
    // Safe logging: only log counts and IDs, never full payloads
    safeLog('info', '[game-requests] Listed requests', {
      correlationId,
      adminFid: fid,
      status,
      count: requests.length,
      requestIds: requests.length > 0 ? requests.map((r: any) => r.id?.substring(0, 8) || '').filter(Boolean).join(',') : 'none', // Only first 8 chars of IDs
    });
    
    // Return empty array if no results (success case)
    return NextResponse.json<ApiResponse>(
      { ok: true, data: requests },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }
    
    console.error("[API][game-requests] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch game requests" },
      { status: 500 }
    );
  }
}
