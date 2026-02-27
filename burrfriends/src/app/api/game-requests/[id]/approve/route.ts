import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireAdmin } from "~/lib/admin";
import { createGameFromPayload } from "~/lib/game-creation";
import { validateAndSanitizeGameRequestPayload } from "~/lib/game-request-validation";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import type { ApiResponse } from "~/lib/types";

/**
 * POST /api/game-requests/[id]/approve
 * Approve a game request and create the game (admin only)
 * 
 * ATOMIC APPROVAL WITH IDEMPOTENCY:
 * - Uses conditional update to prevent double-approve
 * - Generates approval_claim_id for idempotent retries
 * - Only rollback if created_game_id IS NULL (prevents rollback after partial success)
 * - Notifications are wrapped and never throw (best-effort)
 * 
 * This endpoint:
 * 1. Checks for idempotency (if already approved by this admin, return existing game_id)
 * 2. Atomically claims the request (only if status='pending')
 * 3. Validates and sanitizes payload
 * 4. Creates the game using the same logic as POST /api/games
 * 5. Updates the request with game ID and approval info
 * 6. Returns the created game ID
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
    
    // IDEMPOTENCY CHECK: Check if request was already approved by this admin
    // Load request to check current state
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
    
    // If already approved and has created_game_id, check if it was approved by this admin
    if (existingRequest.status === 'approved' && existingRequest.created_game_id) {
      // If approved by same admin (idempotent retry), return existing game_id
      if (existingRequest.approved_by_fid === fid) {
        safeLog('info', '[game-requests][approve] Idempotent approval retry', {
          correlationId,
          requestId,
          approvedByFid: fid,
          existingGameId: existingRequest.created_game_id,
        });
        
        return NextResponse.json<ApiResponse>(
          { ok: true, data: { gameId: existingRequest.created_game_id } },
          { status: 200 }
        );
      } else {
        // Approved by different admin
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Request was already approved by another admin. Cannot approve twice.` },
          { status: 409 }
        );
      }
    }
    
    // Generate approval_claim_id for idempotent tracking
    const approvalClaimId = randomUUID();
    
    // ATOMIC STEP 1: Try to atomically claim the request (only if status='pending')
    // This uses a conditional update that only affects rows where status='pending'
    // If 0 rows are affected, the request was already processed by another admin
    const claimResult = await pokerDb.updateConditional<any>(
      'game_requests',
      { id: requestId },
      {
        // Mark as approved immediately (atomic claim)
        // We'll update created_game_id after game creation succeeds
        status: 'approved',
        approved_by_fid: fid,
        approval_claim_id: approvalClaimId,
      },
      { status: 'pending' } // Only update if status is 'pending'
    );
    
    // If no rows were affected, request was already processed
    if (claimResult.rowsAffected === 0) {
      // Reload to check current status
      const currentRequests = await pokerDb.fetch<any>('game_requests', {
        filters: { id: requestId },
        limit: 1,
      });
      
      if (!currentRequests || currentRequests.length === 0) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Game request not found" },
          { status: 404 }
        );
      }
      
      const currentRequest = currentRequests[0];
      
      // Check if it's an idempotent retry (same admin, same approval_claim_id would match, but unlikely here)
      // More likely it was processed by another admin or changed state
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Request is already ${currentRequest.status}. Cannot approve twice.` },
        { status: 409 }
      );
    }
    
    // Request was successfully claimed (status changed from 'pending' to 'approved')
    const claimedRequest = claimResult.updatedRows[0];
    
    // ATOMIC STEP 2: Validate and sanitize payload before creating game
    let sanitizedPayload;
    try {
      sanitizedPayload = validateAndSanitizeGameRequestPayload(claimedRequest.payload);
    } catch (validationError: any) {
      // Payload validation failed - rollback the approval
      // Only rollback if created_game_id IS NULL (safety check)
      try {
        const currentState = await pokerDb.fetch<any>('game_requests', {
          filters: { id: requestId },
          limit: 1,
        });
        
        if (currentState && currentState.length > 0 && !currentState[0].created_game_id) {
          await pokerDb.update('game_requests',
            { id: requestId },
            { status: 'pending', approved_by_fid: null, approval_claim_id: null }
          );
        }
      } catch (rollbackError) {
        // Log but don't throw - the validation error is the primary concern
        safeLog('error', '[game-requests][approve] Failed to rollback after validation error', {
          correlationId,
          requestId,
          rollbackError: (rollbackError as any)?.message,
        });
      }
      
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Invalid payload: ${validationError.message}` },
        { status: 400 }
      );
    }
    
    // ATOMIC STEP 3: Create game using shared logic
    // Use admin's FID as the creator (not requester's FID)
    // This ensures proper ownership/permissions
    // NOTE: createGameFromPayload wraps notifications in try/catch and never throws
    let game;
    try {
      const result = await createGameFromPayload(
        sanitizedPayload,
        fid, // Admin's FID
        correlationId
      );
      game = result.game;
    } catch (gameCreationError: any) {
      // Game creation failed - only rollback if created_game_id IS NULL
      // This prevents rollback after partial success (e.g., game created but notification failed)
      try {
        const currentState = await pokerDb.fetch<any>('game_requests', {
          filters: { id: requestId },
          limit: 1,
        });
        
        // Only rollback if no game was created
        if (currentState && currentState.length > 0 && !currentState[0].created_game_id) {
          await pokerDb.update('game_requests',
            { id: requestId },
            { status: 'pending', approved_by_fid: null, approval_claim_id: null }
          );
        } else {
          // Game was created but something else failed - keep status='approved'
          safeLog('warn', '[game-requests][approve] Game creation failed but created_game_id exists - keeping approved status', {
            correlationId,
            requestId,
            createdGameId: currentState?.[0]?.created_game_id,
            error: gameCreationError.message,
          });
        }
      } catch (rollbackError) {
        // Log but don't throw - the game creation error is the primary concern
        safeLog('error', '[game-requests][approve] Failed to check rollback eligibility after game creation error', {
          correlationId,
          requestId,
          rollbackError: (rollbackError as any)?.message,
        });
      }
      
      throw gameCreationError; // Re-throw to be caught by outer catch
    }
    
    // ATOMIC STEP 4: Update request with created game ID
    // This is safe because we already claimed it, and game creation succeeded
    // NOTE: If this update fails, the game was still created, so we return success
    // The created_game_id might be missing from the request row, but the game exists
    try {
      await pokerDb.update('game_requests',
        { id: requestId },
        {
          created_game_id: game.id,
          // status, approved_by_fid, and approval_claim_id already set in atomic claim
        }
      );
    } catch (updateError) {
      // Log but don't fail - game was created successfully
      safeLog('error', '[game-requests][approve] Failed to update request with created_game_id, but game was created', {
        correlationId,
        requestId,
        gameId: game.id,
        updateError: (updateError as any)?.message,
      });
    }
    
    // Safe logging: only log IDs and counts, never full payloads
    safeLog('info', '[game-requests][approve] Request approved and game created', {
      correlationId,
      requestId,
      requesterFid: claimedRequest.requester_fid,
      approvedByFid: fid,
      approvalClaimId: approvalClaimId,
      gameId: game.id,
      payloadFieldCount: Object.keys(sanitizedPayload).length,
    });
    
    return NextResponse.json<ApiResponse>(
      { ok: true, data: { gameId: game.id } },
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
    
    console.error("[API][game-requests][approve] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to approve game request" },
      { status: 500 }
    );
  }
}
