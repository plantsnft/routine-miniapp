import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess } from "~/lib/pokerPermissions";
import { requireNotBlocked } from "~/lib/userBlocks";
import { canUserJoinGame } from "~/lib/eligibility";
import { getCorrelationId } from "~/lib/correlation-id";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse, Game, GameParticipant, EligibilityResult } from "~/lib/types";

/**
 * POST /api/games/[id]/join
 * Join a game (or update eligibility)
 * 
 * MVP: Open signup - any authed user can join (unless blocked)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireNotBlocked - prevents blocked users from joining
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = getCorrelationId(req);
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    safeLog('info', '[games][join] User joining game', {
      correlationId,
      gameId,
      fid,
    });
    
    // MVP: Check if user is blocked (open signup, but blocked users cannot join)
    await requireNotBlocked(fid);
    
    // Verify game exists (no membership requirement for MVP)
    await requireGameAccess(fid, gameId);

    // Fetch game - use pokerDb
    const gamesRaw = await pokerDb.fetch<any>('games', {
      filters: { id: gameId },
      limit: 1,
    });

    if (!gamesRaw || gamesRaw.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const gameRaw = gamesRaw[0];
    // Map database fields to API fields (same as GET endpoints)
    const game: Game = {
      ...gameRaw,
      scheduled_time: gameRaw.game_date || null,
      title: gameRaw.name || null,
      gating_type: gameRaw.buy_in_amount && gameRaw.buy_in_amount > 0 ? 'entry_fee' : 'open',
      entry_fee_amount: gameRaw.buy_in_amount,
      entry_fee_currency: gameRaw.buy_in_currency,
    } as Game;

    // GATING: For paid games, require on-chain status to be 'active'
    const isPaidGame = gameRaw.buy_in_amount && parseFloat(String(gameRaw.buy_in_amount)) > 0;
    if (isPaidGame) {
      const onchainStatus = gameRaw.onchain_status;
      if (onchainStatus !== 'active') {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: onchainStatus === 'failed' 
              ? "Game not active on-chain. Ask an admin to retry activation."
              : "Game not active on-chain yet. Please wait or ask an admin to activate it."
          },
          { status: 400 }
        );
      }
    }

    // REGISTRATION WINDOW ENFORCEMENT: Check if registration is open
    const { isRegistrationOpen } = await import('~/lib/game-registration');
    
    // Count current joined participants (status='joined' only)
    const joinedParticipants = await pokerDb.fetch<any>('participants', {
      filters: { game_id: gameId, status: 'joined' },
      select: 'id',
    });
    const joinedCount = joinedParticipants.length;
    
    // Check if registration is open for this game
    const registrationStatus = isRegistrationOpen(
      {
        status: gameRaw.status,
        game_type: gameRaw.game_type,
        registration_close_minutes: gameRaw.registration_close_minutes,
        scheduled_time: gameRaw.game_date,
        game_date: gameRaw.game_date,
        max_participants: gameRaw.max_participants,
      },
      joinedCount
    );
    
    // If already a participant, allow them to re-join (update eligibility, etc.)
    const existingParticipants = await pokerDb.fetch<GameParticipant>('participants', {
      filters: { game_id: gameId, fid: fid },
      limit: 1,
    });
    const isExistingParticipant = existingParticipants.length > 0;
    
    // Only block if registration is closed AND user is not already a participant
    if (!isExistingParticipant && !registrationStatus.isOpen) {
      safeLog('info', '[games][join] Registration closed, join blocked', {
        correlationId,
        gameId,
        gameType: gameRaw.game_type,
        reason: registrationStatus.reason,
        closeAt: registrationStatus.closeAt,
        joinedCount,
        max_participants: gameRaw.max_participants,
        blocked: true,
        fid,
      });
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: registrationStatus.reason || "Registration is closed",
          closeAt: registrationStatus.closeAt,
        },
        { status: 400 }
      );
    }
    
    safeLog('info', '[games][join] Registration check passed', {
      correlationId,
      gameId,
      gameType: gameRaw.game_type,
      registrationOpen: registrationStatus.isOpen,
      joinedCount,
      max_participants: gameRaw.max_participants,
      blocked: false,
      fid,
      isExistingParticipant,
    });

    // Note: existingParticipants already computed above for registration check
    const existingParticipant = existingParticipants[0];

    // Check eligibility (eligibility check is informational only, not stored in DB)
    const eligibility = await canUserJoinGame(fid, game, undefined);

    // Upsert participant record - use pokerDb
    // Note: Schema only has: id, game_id, fid, status, tx_hash, paid_at, inserted_at, updated_at
    const participantData: any = {
      game_id: gameId,
      fid: fid,
      status: 'joined', // Default status
    };

    // If updating existing, keep status and other fields
    if (existingParticipant) {
      participantData.status = existingParticipant.status || 'joined';
      // Preserve legacy fields if they exist
      if ((existingParticipant as any).has_seen_password !== undefined) {
        (participantData as any).has_seen_password = (existingParticipant as any).has_seen_password;
      }
      if ((existingParticipant as any).password_viewed_at) {
        (participantData as any).password_viewed_at = (existingParticipant as any).password_viewed_at;
      }
    }

    const participant = await pokerDb.upsert<GameParticipant>('participants', participantData);
    const result = Array.isArray(participant) ? participant[0] : participant;

    return NextResponse.json<ApiResponse<{ eligibility: EligibilityResult; participant: GameParticipant }>>({
      ok: true,
      data: {
        eligibility,
        participant: result,
      },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      safeLog('warn', '[games][join] Authentication error', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors (blocked user, etc.)
    if (error.message?.includes('blocked') || error.message?.includes('Blocked')) {
      safeLog('warn', '[games][join] User blocked', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('member') || error.message?.includes('access')) {
      safeLog('warn', '[games][join] Access denied', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    safeLog('error', '[games][join] Error joining game', {
      correlationId,
      error: error?.message || "Failed to join game",
      stack: error?.stack,
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to join game" },
      { status: 500 }
    );
  }
}
