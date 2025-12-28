import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireAdmin } from "~/lib/admin";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import type { ApiResponse } from "~/lib/types";

/**
 * POST /api/game-requests/[id]/reject
 * Reject a game request (admin only)
 * 
 * Optionally accepts a rejection_reason in the request body
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const correlationId = getCorrelationId(req);
    const { fid } = await requireAuth(req);
    
    // Admin only
    requireAdmin(fid);
    
    const { id: requestId } = await params;
    const body = await req.json().catch(() => ({})); // Optional body
    const { rejection_reason } = body;
    
    // Load request
    const requests = await pokerDb.fetch<any>('game_requests', {
      filters: { id: requestId },
      limit: 1,
    });
    
    if (!requests || requests.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game request not found" },
        { status: 404 }
      );
    }
    
    // ATOMIC REJECTION: Use conditional update to prevent double-reject
    // Only updates if status='pending' (atomic claim)
    // If 0 rows affected, request was already processed
    const rejectResult = await pokerDb.updateConditional<any>(
      'game_requests',
      { id: requestId },
      {
        status: 'rejected',
        rejection_reason: rejection_reason || null,
      },
      { status: 'pending' } // Only update if status is 'pending'
    );
    
    // If no rows were affected, request was already processed
    if (rejectResult.rowsAffected === 0) {
      // Check current status to provide helpful error message
      const existingRequests = await pokerDb.fetch<any>('game_requests', {
        filters: { id: requestId },
        limit: 1,
      });
      
      if (!existingRequests || existingRequests.length === 0) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Game request not found" },
          { status: 404 }
        );
      }
      
      const existingRequest = existingRequests[0];
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Request is already ${existingRequest.status}. Cannot reject twice.` },
        { status: 409 }
      );
    }
    
    const rejectedRequest = rejectResult.updatedRows[0];
    
    // Safe logging: never log full payload, only metadata
    safeLog('info', '[game-requests][reject] Request rejected', {
      correlationId,
      requestId,
      requesterFid: rejectedRequest.requester_fid,
      rejectedByFid: fid,
      hasReason: !!rejection_reason,
      payloadFieldCount: rejectedRequest.payload ? Object.keys(rejectedRequest.payload).length : 0,
    });
    
    return NextResponse.json<ApiResponse>(
      { ok: true },
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
    
    console.error("[API][game-requests][reject] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to reject game request" },
      { status: 500 }
    );
  }
}

