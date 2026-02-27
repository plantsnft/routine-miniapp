/**
 * GET /api/in-or-out/games/[id] - Get game detail by ID
 * No is_preview filter so preview games are playable by direct URL.
 * When in_progress, includes quitterCount and amountPerQuitter for display.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const PRIZE_POOL = 10_000_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    const games = await pokerDb.fetch<any>("in_or_out_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: true, data: game });
    }

    const [choices, alivePlayers] = await Promise.all([
      pokerDb.fetch<{ choice: string }>("in_or_out_choices", {
        filters: { game_id: gameId },
        limit: 5000,
      }),
      pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        filters: { status: "alive" },
        select: "fid",
        limit: 100000,
      }),
    ]);
    const quitterCount = (choices || []).filter((c) => c.choice === "quit").length;
    const amountPerQuitter = quitterCount > 0 ? Math.floor(PRIZE_POOL / quitterCount) : 0;
    const eligibleCount = (alivePlayers || []).length;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        ...game,
        quitterCount,
        amountPerQuitter,
        eligibleCount,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[in-or-out/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
