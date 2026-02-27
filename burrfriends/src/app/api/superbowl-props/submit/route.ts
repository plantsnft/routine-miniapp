/**
 * POST /api/superbowl-props/submit - Submit picks for a game
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { checkUserStakeByFid } from "~/lib/staking";
import { SUPERBOWL_PROPS_COUNT } from "~/lib/superbowl-props-constants";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const gameId = typeof body.gameId === "string" ? body.gameId.trim() : null;
    const picks = Array.isArray(body.picks) ? body.picks : null;
    const totalScoreGuess = typeof body.totalScoreGuess === "number" ? body.totalScoreGuess : parseInt(String(body.totalScoreGuess || ""), 10);

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "gameId is required" }, { status: 400 });
    }

    if (!picks || picks.length !== SUPERBOWL_PROPS_COUNT) {
      return NextResponse.json<ApiResponse>({ ok: false, error: `Must submit exactly ${SUPERBOWL_PROPS_COUNT} picks` }, { status: 400 });
    }

    // Validate picks are all 0 or 1
    for (let i = 0; i < picks.length; i++) {
      if (picks[i] !== 0 && picks[i] !== 1) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Invalid pick at index ${i}. Must be 0 or 1.` }, { status: 400 });
      }
    }

    if (isNaN(totalScoreGuess) || totalScoreGuess < 0 || totalScoreGuess > 200) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Total score guess must be between 0 and 200" }, { status: 400 });
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

    // Check game is open
    if (game.status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Submissions are closed for this game" }, { status: 400 });
    }

    // Check deadline
    const now = new Date();
    const deadline = new Date(game.submissions_close_at);
    if (now > deadline) {
      // Auto-close the game
      await pokerDb.update("superbowl_props_games", { id: gameId }, { status: "closed" });
      return NextResponse.json<ApiResponse>({ ok: false, error: "Submissions are closed (deadline passed)" }, { status: 400 });
    }

    // Check staking if required
    const stakingMin = game.staking_min_amount != null ? Number(game.staking_min_amount) : 0;
    if (stakingMin > 0) {
      const stakeCheck = await checkUserStakeByFid(fid, stakingMin);
      if (!stakeCheck.meetsRequirement) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: `Insufficient stake. Required: ${(stakingMin / 1_000_000).toFixed(0)}M BETR, You have: ${stakeCheck.stakedAmount} BETR`,
            data: {
              reason: "insufficient_stake" as const,
              requiredAmount: stakingMin,
              stakedAmount: stakeCheck.stakedAmount,
            },
          },
          { status: 403 }
        );
      }
    }

    // Check if already submitted
    const existing = await pokerDb.fetch<{ id: string }>("superbowl_props_submissions", {
      filters: { game_id: gameId, fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already submitted picks for this game" }, { status: 400 });
    }

    // Insert submission
    await pokerDb.insert("superbowl_props_submissions", [
      {
        game_id: gameId,
        fid,
        picks_json: picks,
        total_score_guess: totalScoreGuess,
        submitted_at: new Date().toISOString(),
      },
    ]);

    // Hydrate user profile (same pattern as BUDDY UP signup)
    try {
      const client = getNeynarClient();
      const { users } = await client.fetchBulkUsers({ fids: [fid] });
      const u = users?.[0] as { username?: string; display_name?: string; pfp_url?: string; pfp?: { url?: string } } | undefined;
      if (u) {
        await pokerDb.update(
          "superbowl_props_submissions",
          { game_id: gameId, fid },
          {
            username: u.username ?? null,
            display_name: u.display_name ?? null,
            pfp_url: u.pfp_url ?? u.pfp?.url ?? null,
          }
        );
      }
    } catch (profileErr) {
      console.error("[superbowl-props/submit] Failed to hydrate profile:", profileErr);
      // Non-fatal - submission already saved
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Your picks have been submitted!",
      data: { totalScoreGuess },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("UNIQUE")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already submitted picks for this game" }, { status: 400 });
    }
    console.error("[superbowl-props/submit POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit picks" }, { status: 500 });
  }
}
