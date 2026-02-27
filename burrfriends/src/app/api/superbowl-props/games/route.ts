/**
 * POST /api/superbowl-props/games - Create a new BETR SUPERBOWL: PROPS game (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { isValidStakingThreshold } from "~/lib/constants";
import { SUPERBOWL_PROPS_DEFAULT_DEADLINE } from "~/lib/superbowl-props-constants";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const totalPrizePool = typeof body.totalPrizePool === "number" ? body.totalPrizePool : 23_400_000;
    const stakingMinAmount = body.stakingMinAmount ?? null;

    // Validate staking threshold
    if (stakingMinAmount !== null && !isValidStakingThreshold(stakingMinAmount)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Invalid staking amount. Must be 0, 1M, 5M, 25M, 50M, 100M, or 200M BETR." },
        { status: 400 }
      );
    }

    // Check for existing open game
    const existingGames = await pokerDb.fetch<{ id: string }>("superbowl_props_games", {
      filters: { status: "open" },
      limit: 1,
    });

    if (existingGames && existingGames.length > 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "An open game already exists. Close or settle it first." },
        { status: 400 }
      );
    }

    // Create game
    const game = await pokerDb.insert("superbowl_props_games", [
      {
        title: "BETR SUPERBOWL: PROPS",
        total_prize_pool: totalPrizePool,
        staking_min_amount: stakingMinAmount,
        submissions_close_at: SUPERBOWL_PROPS_DEFAULT_DEADLINE.toISOString(),
        status: "open",
        created_by_fid: fid,
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { game: game[0] },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-props/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}
