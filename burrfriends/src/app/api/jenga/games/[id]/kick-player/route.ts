/**
 * POST /api/jenga/games/[id]/kick-player - Kick player from game (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;
    const body = await req.json().catch(() => ({}));
    const playerFid = typeof body.fid === "number" ? body.fid : parseInt(String(body.fid || ""), 10);

    if (isNaN(playerFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "fid is required" }, { status: 400 });
    }

    // Fetch game
    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      current_turn_fid: number | null;
      turn_order: number[];
      eliminated_fids: number[];
    }>("jenga_games", {
      filters: { id: gameId },
      select: "id,status,current_turn_fid,turn_order,eliminated_fids",
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "signup" && game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in signup or in progress" }, { status: 400 });
    }

    // Check if player is in game
    const turnOrder = game.turn_order || [];
    const eliminatedFids = game.eliminated_fids || [];

    if (!turnOrder.includes(playerFid) && !eliminatedFids.includes(playerFid)) {
      // Check if player is signed up (for signup phase)
      if (game.status === "signup") {
        const signups = await pokerDb.fetch<{ fid: number }>("jenga_signups", {
          filters: { game_id: gameId, fid: playerFid },
          limit: 1,
        });
        if (!signups || signups.length === 0) {
          return NextResponse.json<ApiResponse>({ ok: false, error: "Player is not in this game" }, { status: 400 });
        }
        // Remove from signups
        await pokerDb.delete("jenga_signups", { game_id: gameId, fid: playerFid });
        return NextResponse.json<ApiResponse>({ ok: true, message: "Player removed from game" });
      } else {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Player is not in this game" }, { status: 400 });
      }
    }

    // Remove from turn order and add to eliminated
    const newTurnOrder = turnOrder.filter((f) => f !== playerFid);
    const newEliminatedFids = eliminatedFids.includes(playerFid) ? eliminatedFids : [...eliminatedFids, playerFid];

    const now = new Date().toISOString();
    const updateData: any = {
      turn_order: newTurnOrder,
      eliminated_fids: newEliminatedFids,
      updated_at: now,
    };

    // If kicked player is current turn, advance to next player
    if (game.current_turn_fid === playerFid) {
      const nextTurnFid = newTurnOrder.length > 0 ? newTurnOrder[0] : null;
      const nextTurnStartedAt = nextTurnFid ? now : null;

      updateData.current_turn_fid = nextTurnFid;
      updateData.current_turn_started_at = nextTurnStartedAt;

      // Check if game should end
      if (newTurnOrder.length <= 1) {
        updateData.status = "settled";
        updateData.game_ended_reason = newTurnOrder.length === 1 ? "last_player_standing" : "all_eliminated";
      }
    } else {
      // Check if game should end (all players eliminated)
      if (newTurnOrder.length <= 1) {
        updateData.status = "settled";
        updateData.game_ended_reason = newTurnOrder.length === 1 ? "last_player_standing" : "all_eliminated";
      }
    }

    await pokerDb.update("jenga_games", { id: gameId }, updateData);

    // Send elimination notification to kicked player
    if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
      try {
        const { sendJengaNotificationAsync } = await import('~/lib/notifications');
        const { APP_URL } = await import('~/lib/constants');
        await sendJengaNotificationAsync(
          [playerFid],
          'jenga_player_eliminated',
          gameId,
          'JENGA: You were kicked',
          'You have been removed from the game by an admin.',
          new URL(`/jenga?gameId=${gameId}`, APP_URL).href,
          playerFid
        );
      } catch (notifError: any) {
        safeLog('error', '[jenga/games/[id]/kick-player] Failed to send elimination notification', {
          gameId,
          kickedFid: playerFid,
          error: notifError?.message || String(notifError),
        });
      }
    }

    // Send turn notification to next player if kicked player was current turn
    if (game.current_turn_fid === playerFid && updateData.current_turn_fid) {
      if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
        try {
          const { sendJengaNotificationAsync } = await import('~/lib/notifications');
          const { APP_URL } = await import('~/lib/constants');
          await sendJengaNotificationAsync(
            [updateData.current_turn_fid],
            'jenga_turn_started',
            gameId,
            'JENGA: Your turn',
            'It\'s your turn to make a move!',
            new URL(`/jenga?gameId=${gameId}`, APP_URL).href,
            updateData.current_turn_fid
          );
        } catch (notifError: any) {
          safeLog('error', '[jenga/games/[id]/kick-player] Failed to send turn notification', {
            gameId,
            nextTurnFid: updateData.current_turn_fid,
            error: notifError?.message || String(notifError),
          });
        }
      }
    }

    safeLog("info", "[jenga/games/[id]/kick-player] Player kicked", {
      gameId,
      kickedFid: playerFid,
      wasCurrentTurn: game.current_turn_fid === playerFid,
      nextTurnFid: updateData.current_turn_fid,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Player kicked from game",
      data: { gameId, kickedFid: playerFid },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/kick-player POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to kick player" }, { status: 500 });
  }
}
