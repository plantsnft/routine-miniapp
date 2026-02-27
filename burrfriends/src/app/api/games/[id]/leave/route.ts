import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getCorrelationId } from "~/lib/correlation-id";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse, GameParticipant } from "~/lib/types";

/**
 * POST /api/games/[id]/leave
 * Leave (unregister from) a game.
 *
 * Guards:
 *   - Auth required (FID from verified JWT)
 *   - Game must exist and have status 'open'
 *   - Participant must exist with status 'joined'
 *
 * Action: Deletes the participant row from burrfriends_participants.
 * Re-join: After deletion the user can rejoin via POST /api/games/[id]/join
 *          (pokerDb.upsert + UNIQUE(game_id, fid) handles re-insertion).
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

    safeLog('info', '[games][leave] User leaving game', {
      correlationId,
      gameId,
      fid,
    });

    // Fetch game to verify it exists and is open
    const games = await pokerDb.fetch<any>('burrfriends_games', {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const game = games[0];

    // Only allow leaving open games
    if (game.status !== 'open') {
      safeLog('info', '[games][leave] Cannot leave - game not open', {
        correlationId,
        gameId,
        fid,
        gameStatus: game.status,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Cannot leave a game that is ${game.status}. Only open games allow leaving.` },
        { status: 400 }
      );
    }

    // Check that user is actually a participant with status 'joined'
    const participants = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
      filters: { game_id: gameId, fid: fid },
      limit: 1,
    });

    if (!participants || participants.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "You are not a participant in this game" },
        { status: 400 }
      );
    }

    const participant = participants[0];

    // Only allow leaving if status is 'joined' (not 'paid' — paid games need refund flow)
    if (participant.status !== 'joined') {
      safeLog('info', '[games][leave] Cannot leave - participant status not joined', {
        correlationId,
        gameId,
        fid,
        participantStatus: participant.status,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Cannot leave with status '${participant.status}'. Only joined participants can leave.` },
        { status: 400 }
      );
    }

    // Delete the participant row
    await pokerDb.delete('burrfriends_participants', { game_id: gameId, fid: fid });

    safeLog('info', '[games][leave] User successfully left game', {
      correlationId,
      gameId,
      fid,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      safeLog('warn', '[games][leave] Authentication error', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[games][leave] Error leaving game', {
      correlationId,
      error: error?.message || "Failed to leave game",
      stack: error?.stack,
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to leave game" },
      { status: 500 }
    );
  }
}
