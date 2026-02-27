/**
 * POST /api/take-from-the-pile/games - Create new TAKE FROM THE PILE game (admin only)
 * Single game only: block if any game has status open or in_progress.
 * GET /api/take-from-the-pile/games - List all games
 * Phase 37.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const DEFAULT_PRIZE_POOL = 5_000_000;
const DEFAULT_PICK_DEADLINE_MINUTES = 60;

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const openGames = await pokerDb.fetch<any>("take_from_the_pile_games", {
      filters: { status: "open" },
      limit: 1,
    });
    const inProgress = await pokerDb.fetch<any>("take_from_the_pile_games", {
      filters: { status: "in_progress" },
      limit: 1,
    });
    if ((openGames && openGames.length > 0) || (inProgress && inProgress.length > 0)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "A TAKE FROM THE PILE game is already active. Only one game can run at a time." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const community: "betr" | "minted_merch" = body.community === "minted_merch" ? "minted_merch" : "betr";
    const prizePool = typeof body.prize_pool_amount === "number" && body.prize_pool_amount > 0
      ? body.prize_pool_amount
      : DEFAULT_PRIZE_POOL;
    const pickDeadlineMinutes = typeof body.pick_deadline_minutes === "number" && body.pick_deadline_minutes > 0
      ? Math.min(1440, body.pick_deadline_minutes)
      : DEFAULT_PICK_DEADLINE_MINUTES;

    const now = new Date().toISOString();
    const game = await pokerDb.insert("take_from_the_pile_games", [
      {
        title: body.title || "TAKE FROM THE PILE",
        status: "open",
        is_preview: !!body.isPreview,
        created_by_fid: fid,
        created_at: now,
        updated_at: now,
        community,
        prize_pool_amount: prizePool,
        current_pot_amount: prizePool,
        turn_order_fids: [],
        pick_deadline_minutes: pickDeadlineMinutes,
      },
    ]);

    if (!game || game.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create game" }, { status: 500 });
    }

    const createdGame = game[0] as unknown as { id: string; [key: string]: unknown };

    return NextResponse.json<ApiResponse>({ ok: true, data: createdGame });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[take-from-the-pile/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const games = await pokerDb.fetch<any>("take_from_the_pile_games", {
      order: "created_at.desc",
      limit: 100,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: games || [] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[take-from-the-pile/games GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch games" }, { status: 500 });
  }
}
