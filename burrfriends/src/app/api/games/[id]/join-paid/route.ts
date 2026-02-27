import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess } from "~/lib/pokerPermissions";
import { isPaidGame } from "~/lib/games";
import { decryptPassword } from "~/lib/crypto";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

/**
 * POST /api/games/[id]/join-paid
 * ⚠️ DEPRECATED: Use /api/payments/confirm instead
 * 
 * This route is kept for backwards compatibility but forwards to the proper flow.
 * It does NOT verify on-chain transactions - use /api/payments/confirm for that.
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireGameAccess - enforces club membership
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // SAFETY: Require game access (club membership check)
    await requireGameAccess(fid, gameId);

    const body = await req.json();
    const { tx_hash } = body;

    // Fetch game - use pokerDb
    const games = await pokerDb.fetch<Game>('burrfriends_games', {
      filters: { id: gameId },
      select: '*',
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const game = games[0];

    // Verify this is a paid game
    if (!isPaidGame(game) || !game.entry_fee_amount) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "This game does not require payment" },
        { status: 400 }
      );
    }

    // REGISTRATION WINDOW ENFORCEMENT: Check if registration is open
    const { isRegistrationOpen } = await import('~/lib/game-registration');
    const { safeLog } = await import('~/lib/redaction');
    const { getCorrelationId } = await import('~/lib/correlation-id');
    const correlationId = getCorrelationId(req);
    
    // Count current joined participants (status='joined' only)
    const joinedParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
      filters: { game_id: gameId, status: 'joined' },
      select: 'id',
    });
    const joinedCount = joinedParticipants.length;
    
    // Check if registration is open for this game
    const registrationStatus = isRegistrationOpen(
      {
        status: (game as any).status,
        game_type: (game as any).game_type,
        registration_close_minutes: (game as any).registration_close_minutes,
        scheduled_time: (game as any).game_date,
        game_date: (game as any).game_date,
        max_participants: (game as any).max_participants,
      },
      joinedCount
    );
    
    // Check if user is already a participant (allow existing participants to re-join)
    const existingParticipants = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
      filters: { game_id: gameId, fid: fid },
      limit: 1,
    });
    const isExistingParticipant = existingParticipants.length > 0;
    
    // Only block if registration is closed AND user is not already a participant
    if (!isExistingParticipant && !registrationStatus.isOpen) {
      const startTime = (game as any).game_date || (game as any).scheduled_time;
      const closeAt = registrationStatus.closeAt;
      
      safeLog('info', '[registration] blocked', {
        gameId,
        gameType: (game as any).game_type || 'standard',
        startTime,
        closeAt,
        now: new Date().toISOString(),
        route: '/api/games/[id]/join-paid',
        reason: registrationStatus.reason,
        fid,
      });
      
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: registrationStatus.reason || "Registration is closed",
          registrationCloseAt: closeAt,
          now: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // ⚠️ DEPRECATED: This route doesn't verify on-chain transactions
    // For proper payment confirmation, use /api/payments/confirm
    
    // Get club for name
    const clubs = await pokerDb.fetch<{ name: string; slug: string }>('clubs', {
      filters: { id: game.club_id },
      select: 'name,slug',
      limit: 1,
    });
    const clubName = clubs[0]?.name || 'Club';

    // Upsert participant with payment confirmed - use pokerDb
    // Note: Schema only has: id, game_id, fid, status, tx_hash, paid_at, inserted_at, updated_at
    const participantData: any = {
      game_id: gameId,
      fid: fid,
      status: 'paid',
      tx_hash: tx_hash || null,
      paid_at: new Date().toISOString(),
    };

    const participant = await pokerDb.upsert<GameParticipant>('burrfriends_participants', participantData);
    const result = Array.isArray(participant) ? participant[0] : participant;

    // Decrypt password
    let gamePassword = null;
    if (game.game_password_encrypted) {
      try {
        gamePassword = decryptPassword(game.game_password_encrypted);
      } catch (_err) {
        // Old encryption format - silently fail (new games use creds_ciphertext)
      }
    }

    return NextResponse.json<ApiResponse<{
      participant: GameParticipant;
      game_password: string | null;
      clubgg_link: string | null;
      club_name: string;
      entry_fee_amount: number;
      entry_fee_currency: string;
    }>>({
      ok: true,
      data: {
        participant: result,
        game_password: gamePassword,
        clubgg_link: game.clubgg_link ?? null,
        club_name: clubName,
        entry_fee_amount: game.entry_fee_amount,
        entry_fee_currency: game.entry_fee_currency || 'USD',
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
    // Handle permission errors
    if (error.message?.includes('member') || error.message?.includes('access')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    // Error logged via safeLog in calling code
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to join paid game" },
      { status: 500 }
    );
  }
}
