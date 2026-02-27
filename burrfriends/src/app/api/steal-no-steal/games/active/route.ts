/**
 * GET /api/steal-no-steal/games/active - Get active games (public)
 */

import { NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET() {
  try {
    // Phase 17.7: Only standard STEAL OR NO STEAL (exclude HEADS UP — has own /active-heads-up)
    const signupGames = await pokerDb.fetch(
      "steal_no_steal_games",
      {
        filters: { status: "signup", community: "betr", is_preview: false, title: "STEAL OR NO STEAL" },
        select: "id, title, prize_amount, decision_time_seconds, status, current_round, staking_min_amount, min_players_to_start, signup_closes_at, start_condition, created_at",
        order: "created_at.desc",
        limit: 50,
      }
    );

    const inProgressGames = await pokerDb.fetch(
      "steal_no_steal_games",
      {
        filters: { status: "in_progress", community: "betr", is_preview: false, title: "STEAL OR NO STEAL" },
        select: "id, title, prize_amount, decision_time_seconds, status, current_round, staking_min_amount, started_at, created_at",
        order: "created_at.desc",
        limit: 50,
      }
    );

    const allGames = [...(signupGames || []), ...(inProgressGames || [])];

    return NextResponse.json<ApiResponse>({ ok: true, data: allGames });
  } catch (e: unknown) {
    console.error("[steal-no-steal/games/active GET]", e);
    const err = e as { message?: string };
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active games" }, { status: 500 });
  }
}
