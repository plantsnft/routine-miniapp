/**
 * POST /api/superbowl-squares/games/[id]/results - Enter Super Bowl scores (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
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

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game ID required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // Parse scores (Phase 23.1: Q1, Halftime, Q3, Final - removed Q2 as it equals Halftime)
    const scores = {
      score_q1_team1: body.scoreQ1Team1,
      score_q1_team2: body.scoreQ1Team2,
      score_halftime_team1: body.scoreHalftimeTeam1,
      score_halftime_team2: body.scoreHalftimeTeam2,
      score_q3_team1: body.scoreQ3Team1,
      score_q3_team2: body.scoreQ3Team2,
      score_final_team1: body.scoreFinalTeam1,
      score_final_team2: body.scoreFinalTeam2,
    };

    // Validate at least one score pair is provided
    const hasQ1 = scores.score_q1_team1 !== undefined && scores.score_q1_team2 !== undefined;
    const hasHalftime = scores.score_halftime_team1 !== undefined && scores.score_halftime_team2 !== undefined;
    const hasQ3 = scores.score_q3_team1 !== undefined && scores.score_q3_team2 !== undefined;
    const hasFinal = scores.score_final_team1 !== undefined && scores.score_final_team2 !== undefined;

    if (!hasQ1 && !hasHalftime && !hasQ3 && !hasFinal) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: "At least one score pair required (Q1, Halftime, Q3, or Final)" 
      }, { status: 400 });
    }

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "locked") {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Cannot enter results in ${game.status} status. Must be in 'locked' status.` 
      }, { status: 400 });
    }

    if (!game.row_numbers || !game.col_numbers) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: "Numbers must be randomized before entering results" 
      }, { status: 400 });
    }

    // Build update object with only provided scores (Phase 23.1: Q1, Halftime, Q3, Final)
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (scores.score_q1_team1 !== undefined) updateData.score_q1_team1 = scores.score_q1_team1;
    if (scores.score_q1_team2 !== undefined) updateData.score_q1_team2 = scores.score_q1_team2;
    if (scores.score_halftime_team1 !== undefined) updateData.score_halftime_team1 = scores.score_halftime_team1;
    if (scores.score_halftime_team2 !== undefined) updateData.score_halftime_team2 = scores.score_halftime_team2;
    if (scores.score_q3_team1 !== undefined) updateData.score_q3_team1 = scores.score_q3_team1;
    if (scores.score_q3_team2 !== undefined) updateData.score_q3_team2 = scores.score_q3_team2;
    if (scores.score_final_team1 !== undefined) updateData.score_final_team1 = scores.score_final_team1;
    if (scores.score_final_team2 !== undefined) updateData.score_final_team2 = scores.score_final_team2;

    // Update game with scores
    const updated = await pokerDb.update("superbowl_squares_games", { id: gameId }, updateData);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: "Scores entered successfully",
        scores: updateData,
        game: updated[0] || { id: gameId, ...updateData },
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-squares/games/[id]/results POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to enter results" }, { status: 500 });
  }
}
