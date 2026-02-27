/**
 * GET /api/steal-no-steal/status - Get user's status for active games
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Get active games user is signed up for
    const signups = await pokerDb.fetch<{ game_id: string }>(
      "steal_no_steal_signups",
      { filters: { fid }, limit: 10 }
    );

    if (!signups || signups.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { hasSignedUp: false, games: [] },
      });
    }

    const gameIds = signups.map((s) => s.game_id);
    const games = [];

    for (const gameId of gameIds) {
      const gameData = await pokerDb.fetch<{
        id: string;
        status: string;
        current_round: number;
      }>("steal_no_steal_games", {
        filters: { id: gameId },
        limit: 1,
      });

      if (!gameData || gameData.length === 0) continue;
      const game = gameData[0];

      if (game.status !== "signup" && game.status !== "in_progress") continue;

      // Check if user has a match in current round
      let matchInfo = null;
      if (game.status === "in_progress") {
        const rounds = await pokerDb.fetch<{ id: string }>(
          "steal_no_steal_rounds",
          { filters: { game_id: gameId, status: "active" }, limit: 1 }
        );

        if (rounds && rounds.length > 0) {
          const roundId = rounds[0].id;

          // Check if player A or B
          const matchesA = await pokerDb.fetch<{ id: string; status: string; decision: string | null }>(
            "steal_no_steal_matches",
            { filters: { round_id: roundId, player_a_fid: fid }, limit: 1 }
          );
          const matchesB = await pokerDb.fetch<{ id: string; status: string; decision: string | null }>(
            "steal_no_steal_matches",
            { filters: { round_id: roundId, player_b_fid: fid }, limit: 1 }
          );

          const match = matchesA?.[0] || matchesB?.[0];
          if (match) {
            const role = matchesA?.[0] ? "holder" : "decider";
            matchInfo = {
              matchId: match.id,
              role,
              status: match.status,
              hasDecided: match.decision !== null,
            };
          }
        }
      }

      games.push({
        gameId: game.id,
        status: game.status,
        currentRound: game.current_round,
        match: matchInfo,
      });
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        hasSignedUp: true,
        games,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch status" }, { status: 500 });
  }
}
