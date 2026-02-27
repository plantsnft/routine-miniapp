import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getClubForGame, requireClubOwner } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { getCorrelationId } from "~/lib/correlation-id";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse, GameParticipant } from "~/lib/types";

/**
 * DELETE /api/games/[id]/participants/[playerFid]
 * Remove a participant from a game (club owner or global admin only).
 *
 * Guards:
 *   - Auth required; caller must be club owner or global admin for the game
 *   - Game must exist and have status 'open' or 'in_progress' (not settled, cancelled, or completed)
 *   - Participant must exist
 *
 * Action: Deletes the participant row from burrfriends_participants.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerFid: string }> }
) {
  const correlationId = getCorrelationId(req);
  try {
    const { id: gameId, playerFid } = await params;
    const targetFid = parseInt(playerFid, 10);
    if (Number.isNaN(targetFid) || targetFid < 1) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Invalid player FID" },
        { status: 400 }
      );
    }

    const { fid } = await requireAuth(req);

    safeLog('info', '[games][participants][delete] Admin removing participant', {
      correlationId,
      gameId,
      callerFid: fid,
      targetFid,
    });

    const clubId = await getClubForGame(gameId);
    if (!clubId) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
    }

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
    if (game.status !== 'open' && game.status !== 'in_progress') {
      safeLog('info', '[games][participants][delete] Game not open or in_progress', {
        correlationId,
        gameId,
        gameStatus: game.status,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Removing participants is only allowed for open or in-progress games. This game is ${game.status}.` },
        { status: 400 }
      );
    }

    const participants = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
      filters: { game_id: gameId, fid: targetFid },
      limit: 1,
    });
    if (!participants || participants.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Participant not found" },
        { status: 404 }
      );
    }

    await pokerDb.delete('burrfriends_participants', { game_id: gameId, fid: targetFid });

    safeLog('info', '[games][participants][delete] Participant removed', {
      correlationId,
      gameId,
      targetFid,
    });

    return NextResponse.json<ApiResponse>({ ok: true });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      safeLog('warn', '[games][participants][delete] Authentication error', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    if (error.message?.includes('owner') || error.message?.includes('permission')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }
    safeLog('error', '[games][participants][delete] Error', {
      correlationId,
      error: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to remove participant" },
      { status: 500 }
    );
  }
}
