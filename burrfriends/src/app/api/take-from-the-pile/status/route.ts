/**
 * GET /api/take-from-the-pile/status - Get user status for TAKE FROM THE PILE
 * Layer 2: return registered: true when isGlobalAdmin(fid). Phase 37.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const isRegistered =
      (await pokerDb.fetch<{ fid: number }>("betr_games_registrations", { filters: { fid, community: "betr" }, limit: 1 }))?.length > 0 ||
      isGlobalAdmin(fid);

    const alivePlayers = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
      filters: { fid, status: "alive", community: "betr" },
      limit: 1,
    });
    const canPlay = (alivePlayers || []).length > 0 || isGlobalAdmin(fid);

    const openGames = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("take_from_the_pile_games", {
      filters: { status: "open", community: "betr" },
      limit: 10,
    });
    const inProgressGames = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("take_from_the_pile_games", {
      filters: { status: "in_progress", community: "betr" },
      limit: 10,
    });
    const allActive = [...(openGames || []), ...(inProgressGames || [])].filter((g) => g.is_preview !== true);

    let gameId: string | null = null;
    let gameStatus: string | null = null;
    let myTurn = false;
    let currentTurnEndsAt: string | null = null;
    let timerPaused = false;
    let currentPot = 0;
    let myTotalTaken = 0;
    let myPreloadAmount: number | null = null;

    if (allActive.length > 0) {
      const game = allActive[0];
      gameId = game.id;
      gameStatus = game.status;
      const fullGame = await pokerDb.fetch<{
        current_turn_ends_at: string | null;
        timer_paused_at: string | null;
        current_pot_amount: number;
        turn_order_fids: number[];
      }>("take_from_the_pile_games", {
        filters: { id: game.id },
        limit: 1,
      });
      if (fullGame && fullGame.length > 0) {
        const g = fullGame[0];
        currentTurnEndsAt = g.current_turn_ends_at ?? null;
        timerPaused = !!g.timer_paused_at;
        currentPot = Number(g.current_pot_amount) || 0;
        const order = (g.turn_order_fids || []) as number[];
        myTurn = order.length > 0 && Number(order[0]) === fid;
      }
      const picks = await pokerDb.fetch<{ amount_taken: number }>("take_from_the_pile_picks", {
        filters: { game_id: game.id, fid: Number(fid) },
        select: "amount_taken",
        limit: 100,
      });
      myTotalTaken = (picks || []).reduce((sum, p) => sum + (Number(p.amount_taken) || 0), 0);
      if (game.status === "in_progress") {
        const preloadRows = await pokerDb.fetch<{ preload_amount: number }>("take_from_the_pile_preloads", {
          filters: { game_id: game.id, fid: Number(fid) },
          limit: 1,
        });
        myPreloadAmount = preloadRows && preloadRows.length > 0 ? Number(preloadRows[0].preload_amount) : null;
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered: !!isRegistered,
        canPlay: !!canPlay,
        gameId,
        gameStatus,
        myTurn,
        currentTurnEndsAt,
        timerPaused,
        currentPot,
        myTotalTaken,
        myPreloadAmount,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[take-from-the-pile/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch status" }, { status: 500 });
  }
}
