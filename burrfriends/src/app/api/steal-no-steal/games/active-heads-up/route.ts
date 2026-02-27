/**
 * GET /api/steal-no-steal/games/active-heads-up - Get active HEADS UP games (public)
 * Phase 17.7: HEADS UP Steal or No Steal — standalone game, filter by title.
 */

import { NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const HEADS_UP_TITLE = "HEADS UP Steal or No Steal";

export async function GET() {
  try {
    const signupGames = await pokerDb.fetch(
      "steal_no_steal_games",
      {
        filters: { status: "signup", community: "betr", is_preview: false, title: HEADS_UP_TITLE },
        select: "id, title, prize_amount, decision_time_seconds, status, current_round, staking_min_amount, min_players_to_start, start_condition, created_at",
        order: "created_at.desc",
        limit: 50,
      }
    );

    const inProgressGames = await pokerDb.fetch(
      "steal_no_steal_games",
      {
        filters: { status: "in_progress", community: "betr", is_preview: false, title: HEADS_UP_TITLE },
        select: "id, title, prize_amount, decision_time_seconds, status, current_round, staking_min_amount, started_at, created_at",
        order: "created_at.desc",
        limit: 50,
      }
    );

    const allGames = [...(signupGames || []), ...(inProgressGames || [])];

    return NextResponse.json<ApiResponse>({ ok: true, data: allGames });
  } catch (e: unknown) {
    console.error("[steal-no-steal/games/active-heads-up GET]", e);
    const err = e as { message?: string };
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active HEADS UP games" }, { status: 500 });
  }
}
