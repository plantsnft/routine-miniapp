/**
 * POST /api/jenga/games/[id]/move - Submit move
 * Uses atomic lock to prevent race conditions.
 *
 * Phase 6: V2 only. Body { remove: { level, row, block } }. Rejects during 10s handoff (touch or 10s first).
 * Never writes v1 tower_state. Legacy v1 in-progress games cannot move (read-only).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isTowerStateV2 } from "~/lib/jenga-tower-state-v2";
import { validateMove, removeBlock, placeBlock } from "~/lib/jenga-official-rules";
import { runPlacementSimulation, runRemoveSimulation } from "~/lib/jenga-physics";
import { randomUUID } from "crypto";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

const MOVE_LOCK_TTL_SECONDS = 30; // Lock expires after 30 seconds

// Helper to check and clear expired locks
async function clearExpiredLocks(gameId: string) {
  const now = new Date();
  const games = await pokerDb.fetch<{
    id: string;
    move_lock_id: string | null;
    move_locked_at: string | null;
  }>("jenga_games", {
    filters: { id: gameId },
    select: "id,move_lock_id,move_locked_at",
    limit: 1,
  });

  if (games && games.length > 0) {
    const game = games[0];
    if (game.move_lock_id && game.move_locked_at) {
      const lockTime = new Date(game.move_locked_at);
      const lockAge = (now.getTime() - lockTime.getTime()) / 1000;
      if (lockAge > MOVE_LOCK_TTL_SECONDS) {
        // Lock expired, clear it
        await pokerDb.update(
          "jenga_games",
          { id: gameId },
          {
            move_lock_id: null,
            move_locked_at: null,
            updated_at: now.toISOString(),
          }
        );
        safeLog("info", "[jenga/games/[id]/move] Cleared expired lock", {
          gameId,
          lockAge,
        });
      }
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const body = await req.json().catch(() => ({}));
    const remove = body.remove;
    const removalAccuracy = typeof body.removalAccuracy === "number" ? body.removalAccuracy : undefined;
    const placementAccuracy = typeof body.placementAccuracy === "number" ? body.placementAccuracy : undefined;
    const isV2Request =
      remove != null &&
      typeof remove === "object" &&
      typeof remove.level === "number" &&
      typeof remove.row === "number" &&
      typeof remove.block === "number";

    // ——— V2: { remove: { level, row, block } } ———
    if (isV2Request) {
      await clearExpiredLocks(gameId);
      const games = await pokerDb.fetch<{
        id: string;
        status: string;
        current_turn_fid: number | null;
        turn_order: number[];
        eliminated_fids: number[];
        tower_state: unknown;
        move_count: number;
        move_lock_id: string | null;
        current_turn_started_at: string | null;
      }>("jenga_games", { filters: { id: gameId }, limit: 1 });

      if (!games || games.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
      }
      const game = games[0];
      if (game.status !== "in_progress") {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
      }
      if (game.current_turn_fid !== fid) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "It's not your turn" }, { status: 400 });
      }
      if ((game.eliminated_fids || []).includes(fid)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "You have been eliminated" }, { status: 400 });
      }
      if (!isTowerStateV2(game.tower_state)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "V2 move format is only for V2 games" }, { status: 400 });
      }
      // Reject if in handoff: next player must touch (or wait 10s) before moving
      if (game.current_turn_started_at == null && game.current_turn_fid === fid) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Touch to start your turn first" }, { status: 400 });
      }

      const lockId = randomUUID();
      const lockResult = await pokerDb.updateConditional(
        "jenga_games",
        { id: gameId },
        { move_lock_id: lockId, move_locked_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { move_lock_id: null }
      );
      if (lockResult.rowsAffected === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Move already in progress. Please wait." }, { status: 409 });
      }

      try {
        const updatedGames = await pokerDb.fetch<{
          tower_state: unknown;
          move_count: number;
          turn_order: number[];
          eliminated_fids: number[];
        }>("jenga_games", { filters: { id: gameId }, select: "tower_state,move_count,turn_order,eliminated_fids", limit: 1 });
        if (!updatedGames || updatedGames.length === 0) {
          throw new Error("Game not found after lock acquisition");
        }
        const currentGame = updatedGames[0];
        const ts = currentGame.tower_state as { version: 2; tower: (number | null)[][][] };
        const slot = { level: remove.level, row: remove.row, block: remove.block };

        const vr = validateMove(ts.tower, slot);
        if (!vr.ok) {
          return NextResponse.json<ApiResponse>({ ok: false, error: vr.reason }, { status: 400 });
        }

        const { tower: t1, blockId, removedFrom } = removeBlock(ts.tower, slot.level, slot.row, slot.block);

        // Phase 5: on-remove physics sim. If collapse, revert (no place).
        const removeSim = runRemoveSimulation(t1, blockId, removedFrom.level, removedFrom.row, removedFrom.block, undefined, removalAccuracy);
        if (removeSim.collapse) {
          const eliminatedFids = [...(currentGame.eliminated_fids || []), fid];
          const turnOrder = (currentGame.turn_order || []).filter((f: number) => f !== fid);
          const now = new Date().toISOString();
          await pokerDb.update("jenga_games", { id: gameId }, {
            eliminated_fids: eliminatedFids,
            turn_order: turnOrder,
            current_turn_fid: null,
            current_turn_started_at: null,
            status: "settled",
            game_ended_reason: "collapse",
            move_lock_id: null,
            move_locked_at: null,
            updated_at: now,
          });
          return NextResponse.json<ApiResponse>({
            ok: true,
            message: "Move caused collapse",
            data: { eliminated: true, collapse: true, reason: "tower_fell", gameEnded: true },
          });
        }

        const newTower = placeBlock(t1, blockId);

        // Phase 5: placement collapse check (physics + impact/stability). Revert place if collapse.
        const sim = runPlacementSimulation(t1, blockId, placementAccuracy);
        if (sim.collapse) {
          const eliminatedFids = [...(currentGame.eliminated_fids || []), fid];
          const turnOrder = (currentGame.turn_order || []).filter((f: number) => f !== fid);
          const now = new Date().toISOString();
          const gameEndedReason = sim.reason === "tower_fell" ? "tower_fell" : "collapse";
          await pokerDb.update("jenga_games", { id: gameId }, {
            eliminated_fids: eliminatedFids,
            turn_order: turnOrder,
            current_turn_fid: null,
            current_turn_started_at: null,
            status: "settled",
            game_ended_reason: gameEndedReason,
            move_lock_id: null,
            move_locked_at: null,
            updated_at: now,
          });
          return NextResponse.json<ApiResponse>({
            ok: true,
            message: "Move caused collapse",
            data: { eliminated: true, collapse: true, reason: sim.reason, gameEnded: true },
          });
        }

        const newTowerState = { version: 2, tower: newTower, blockInHand: null, removedFrom: null };
        const newMoveCount = currentGame.move_count + 1;

        const turnOrder = [...(currentGame.turn_order || [])];
        const idx = turnOrder.indexOf(fid);
        if (idx !== -1) {
          turnOrder.splice(idx, 1);
          turnOrder.push(fid);
        }
        const nextTurnFid = turnOrder.length > 0 ? turnOrder[0] : null;
        const nextTurnStartedAt = null; // V2 handoff: next player touches or 10s
        const now = new Date().toISOString();
        let newStatus = "in_progress";
        let gameEndedReason: string | null = null;
        if (turnOrder.length <= 1) {
          newStatus = "settled";
          gameEndedReason = turnOrder.length === 1 ? "last_player_standing" : "all_eliminated";
        }

        await pokerDb.insert("jenga_moves", [
          { game_id: gameId, fid, move_data: { remove: slot }, move_number: newMoveCount, created_at: now },
        ]);
        await pokerDb.update("jenga_games", { id: gameId }, {
          tower_state: newTowerState,
          move_count: newMoveCount,
          turn_order: turnOrder,
          current_turn_fid: nextTurnFid,
          current_turn_started_at: nextTurnStartedAt,
          last_placement_at: now,
          status: newStatus,
          game_ended_reason: gameEndedReason,
          move_lock_id: null,
          move_locked_at: null,
          updated_at: now,
        });

        if (nextTurnFid && process.env.ENABLE_PUSH_NOTIFICATIONS === "true") {
          try {
            const { sendJengaNotificationAsync } = await import("~/lib/notifications");
            const { APP_URL } = await import("~/lib/constants");
            await sendJengaNotificationAsync(
              [nextTurnFid],
              "jenga_turn_started",
              gameId,
              "JENGA: Your turn",
              "It's your turn to make a move!",
              new URL(`/jenga?gameId=${gameId}`, APP_URL).href,
              nextTurnFid
            );
          } catch (notifErr: unknown) {
            safeLog("error", "[jenga/games/[id]/move] V2: Failed to send turn notification", {
              gameId,
              nextTurnFid,
              error: (notifErr as Error)?.message ?? String(notifErr),
            });
          }
        }

        return NextResponse.json<ApiResponse>({
          ok: true,
          message: "Move successful",
          data: { moveNumber: newMoveCount, eliminated: false, blocksRemoved: [], nextTurnFid, gameEnded: newStatus === "settled" },
        });
      } finally {
        try {
          await pokerDb.update("jenga_games", { id: gameId }, { move_lock_id: null, move_locked_at: null });
        } catch (clearErr) {
          safeLog("error", "[jenga/games/[id]/move] V2: Failed to clear lock", { gameId, error: clearErr });
        }
      }
    }

    return NextResponse.json<ApiResponse>({ ok: false, error: "Expected V2 move format: { remove: { level, row, block } }" }, { status: 400 });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/move POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to process move" }, { status: 500 });
  }
}
