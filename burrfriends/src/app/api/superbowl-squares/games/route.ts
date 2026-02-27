/**
 * POST /api/superbowl-squares/games - Create new Super Bowl Squares game (admin only)
 * GET /api/superbowl-squares/games - List all games
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // Parse total prize pool (default 25.3M BETR)
    const totalPrizePool = typeof body.totalPrizePool === "number" 
      ? body.totalPrizePool 
      : parseFloat(String(body.totalPrizePool || "25300000"));

    if (isNaN(totalPrizePool) || totalPrizePool <= 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid total prize pool" }, { status: 400 });
    }

    // Prize distribution: Q1=4.2M, Q3=4.2M (stored as Q2), Halftime=6.9M, Final=10M
    // Using exact fractions of 25.3M for precision
    const prizeQ1Pct = body.prizeQ1Pct ?? 42 / 253;        // 4.2M of 25.3M
    const prizeQ2Pct = body.prizeQ2Pct ?? 42 / 253;        // 4.2M (used for Q3)
    const prizeHalftimePct = body.prizeHalftimePct ?? 69 / 253;  // 6.9M
    const prizeFinalPct = body.prizeFinalPct ?? 100 / 253;  // 10M

    // Validate percentages sum to 1.0
    const totalPct = prizeQ1Pct + prizeQ2Pct + prizeHalftimePct + prizeFinalPct;
    if (Math.abs(totalPct - 1.0) > 0.001) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Prize percentages must sum to 1.0 (got ${totalPct})` 
      }, { status: 400 });
    }

    // Tier configuration (defaults)
    const tier1MinStake = body.tier1MinStake ?? 200000000; // 200M
    const tier1SquaresPerUser = body.tier1SquaresPerUser ?? 3;
    const tier2MinStake = body.tier2MinStake ?? 100000000; // 100M
    const tier2SquaresPerUser = body.tier2SquaresPerUser ?? 2;
    const tier3MinStake = body.tier3MinStake ?? 50000000;  // 50M
    const tier3SquaresPerUser = body.tier3SquaresPerUser ?? 1;

    // Square limits
    const autoSquaresLimit = body.autoSquaresLimit ?? 90;
    const adminSquaresLimit = body.adminSquaresLimit ?? 10;

    if (autoSquaresLimit + adminSquaresLimit !== 100) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Auto + admin squares must equal 100 (got ${autoSquaresLimit} + ${adminSquaresLimit})` 
      }, { status: 400 });
    }

    // Title
    const title = body.title || "BETR SUPERBOWL SQUARES";

    const game = await pokerDb.insert("superbowl_squares_games", [
      {
        title,
        total_prize_pool: totalPrizePool,
        prize_q1_pct: prizeQ1Pct,
        prize_q2_pct: prizeQ2Pct,
        prize_halftime_pct: prizeHalftimePct,
        prize_final_pct: prizeFinalPct,
        tier1_min_stake: tier1MinStake,
        tier1_squares_per_user: tier1SquaresPerUser,
        tier2_min_stake: tier2MinStake,
        tier2_squares_per_user: tier2SquaresPerUser,
        tier3_min_stake: tier3MinStake,
        tier3_squares_per_user: tier3SquaresPerUser,
        auto_squares_limit: autoSquaresLimit,
        admin_squares_limit: adminSquaresLimit,
        status: "setup",
        created_by_fid: fid,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    if (!game || game.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create game" }, { status: 500 });
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: game[0] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-squares/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      order: "created_at.desc",
      limit: 100,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: games || [] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[superbowl-squares/games GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch games" }, { status: 500 });
  }
}
