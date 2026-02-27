/**
 * GET /api/in-or-out/status - Get user status for IN OR OUT
 * Layer 2: return registered: true when isGlobalAdmin(fid).
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
      (await pokerDb.fetch<{ fid: number }>("betr_games_registrations", { filters: { fid }, limit: 1 }))?.length > 0 ||
      isGlobalAdmin(fid);

    const alivePlayers = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
      filters: { fid, status: "alive" },
      limit: 1,
    });
    const canPlay = (alivePlayers || []).length > 0;

    const openGames = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("in_or_out_games", {
      filters: { status: "open" },
      limit: 10,
    });
    const inProgressGames = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("in_or_out_games", {
      filters: { status: "in_progress" },
      limit: 10,
    });
    const allActive = [...(openGames || []), ...(inProgressGames || [])].filter((g) => g.is_preview !== true);

    let gameId: string | null = null;
    let gameStatus: string | null = null;
    let myChoice: "quit" | "stay" | null = null;

    if (allActive.length > 0) {
      const game = allActive[0];
      gameId = game.id;
      gameStatus = game.status;
      if (game.status === "in_progress") {
        const choices = await pokerDb.fetch<{ choice: string }>("in_or_out_choices", {
          filters: { game_id: game.id, fid: Number(fid) },
          limit: 1,
        });
        if (choices && choices.length > 0 && (choices[0].choice === "quit" || choices[0].choice === "stay")) {
          myChoice = choices[0].choice as "quit" | "stay";
        }
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered: !!isRegistered,
        canPlay: !!canPlay,
        gameId,
        gameStatus,
        myChoice,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[in-or-out/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch status" }, { status: 500 });
  }
}
