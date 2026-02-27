/**
 * GET /api/steal-no-steal/games/[id]/progress - Get full game progress (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    // Get game
    const games = await pokerDb.fetch<{
      id: string;
      title: string;
      prize_amount: number;
      decision_time_seconds: number;
      status: string;
      current_round: number;
      started_at: string | null;
      settled_at: string | null;
      settle_tx_hash: string | null;
      created_at: string;
    }>("steal_no_steal_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Get signups
    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
      signed_up_at: string;
    }>("steal_no_steal_signups", {
      filters: { game_id: gameId },
      order: "signed_up_at.asc",
      limit: 100,
    });

    // Get all rounds
    const rounds = await pokerDb.fetch<{
      id: string;
      round_number: number;
      status: string;
      created_at: string;
    }>("steal_no_steal_rounds", {
      filters: { game_id: gameId },
      order: "round_number.asc",
      limit: 50,
    });

    // Get all matches for each round
    const roundsWithMatches = [];
    for (const round of rounds || []) {
      const matches = await pokerDb.fetch<{
        id: string;
        match_number: number;
        player_a_fid: number;
        player_b_fid: number;
        briefcase_amount: number;
        decision_deadline: string;
        status: string;
        decision: string | null;
        decided_at: string | null;
        winner_fid: number | null;
      }>("steal_no_steal_matches", {
        filters: { round_id: round.id },
        order: "match_number.asc",
        limit: 100,
      });

      roundsWithMatches.push({
        ...round,
        matches: matches || [],
      });
    }

    // Get settlements
    const settlements = await pokerDb.fetch<{
      winner_fid: number;
      prize_amount: number;
      position: number;
      settled_at: string;
      tx_hash: string | null;
    }>("steal_no_steal_settlements", {
      filters: { game_id: gameId },
      order: "position.asc",
      limit: 20,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        game,
        signups: signups || [],
        rounds: roundsWithMatches,
        settlements: settlements || [],
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games/[id]/progress GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch progress" }, { status: 500 });
  }
}
