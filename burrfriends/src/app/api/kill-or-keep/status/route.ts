/**
 * GET /api/kill-or-keep/status - Get user status for KILL OR KEEP
 * Layer 2: return registered: true when isGlobalAdmin(fid). Phase 38.
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

    const openGames = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("kill_or_keep_games", {
      filters: { status: "open", community: "betr" },
      limit: 10,
    });
    const inProgressGames = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("kill_or_keep_games", {
      filters: { status: "in_progress", community: "betr" },
      limit: 10,
    });
    const allActive = [...(openGames || []), ...(inProgressGames || [])].filter((g) => g.is_preview !== true);

    let gameId: string | null = null;
    let gameStatus: string | null = null;
    let myTurn = false;
    let remainingCount = 0;

    if (allActive.length > 0) {
      const game = allActive[0];
      gameId = game.id;
      gameStatus = game.status;
      const fullGame = await pokerDb.fetch<{ remaining_fids: number[]; current_turn_fid: number | null }>("kill_or_keep_games", {
        filters: { id: game.id },
        limit: 1,
      });
      if (fullGame && fullGame.length > 0) {
        const g = fullGame[0];
        const remaining = (g.remaining_fids || []) as number[];
        remainingCount = remaining.length;
        myTurn = g.current_turn_fid != null && Number(g.current_turn_fid) === fid;
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
        remainingCount,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch status" }, { status: 500 });
  }
}
