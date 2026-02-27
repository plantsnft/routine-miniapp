/**
 * POST /api/superbowl-props/games/[id]/results - Enter answers and calculate scores (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { SUPERBOWL_PROPS_COUNT } from "~/lib/superbowl-props-constants";
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
    const answers = Array.isArray(body.answers) ? body.answers : null;
    const actualTotalScore = typeof body.actualTotalScore === "number" ? body.actualTotalScore : null;

    if (!answers || answers.length !== SUPERBOWL_PROPS_COUNT) {
      return NextResponse.json<ApiResponse>({ ok: false, error: `Must provide exactly ${SUPERBOWL_PROPS_COUNT} answers` }, { status: 400 });
    }

    // Validate answers are all 0 or 1
    for (let i = 0; i < answers.length; i++) {
      if (answers[i] !== 0 && answers[i] !== 1) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Invalid answer at index ${i}. Must be 0 or 1.` }, { status: 400 });
      }
    }

    if (actualTotalScore === null || actualTotalScore < 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "actualTotalScore is required and must be >= 0" }, { status: 400 });
    }

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_props_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status === "settled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is already settled" }, { status: 400 });
    }

    // Update game with answers
    await pokerDb.update("superbowl_props_games", { id: gameId }, {
      answers_json: answers,
      actual_total_score: actualTotalScore,
      status: "closed", // Ensure it's closed
    });

    // Fetch all submissions
    const submissions = await pokerDb.fetch<any>("superbowl_props_submissions", {
      filters: { game_id: gameId },
      limit: 1000,
    });

    if (!submissions || submissions.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        message: "Answers saved. No submissions to score.",
        data: { scoredCount: 0 },
      });
    }

    // Calculate scores for each submission
    let scoredCount = 0;
    for (const sub of submissions) {
      const picks = sub.picks_json;
      let score = 0;
      for (let i = 0; i < SUPERBOWL_PROPS_COUNT; i++) {
        if (picks[i] === answers[i]) {
          score++;
        }
      }
      await pokerDb.update("superbowl_props_submissions", { id: sub.id }, { score });
      scoredCount++;
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: `Answers saved. Scored ${scoredCount} submissions.`,
      data: { scoredCount, actualTotalScore },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-props/games/[id]/results POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to enter results" }, { status: 500 });
  }
}
