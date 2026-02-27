/**
 * POST /api/kill-or-keep/games - Create new KILL OR KEEP game (admin only)
 * Single game only: block if any game has status open or in_progress.
 * GET /api/kill-or-keep/games - List all games
 * Phase 38.
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

    const openGames = await pokerDb.fetch<any>("kill_or_keep_games", {
      filters: { status: "open" },
      limit: 1,
    });
    const inProgress = await pokerDb.fetch<any>("kill_or_keep_games", {
      filters: { status: "in_progress" },
      limit: 1,
    });
    if ((openGames && openGames.length > 0) || (inProgress && inProgress.length > 0)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "A KILL OR KEEP game is already active. Only one game can run at a time." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const community: "betr" | "minted_merch" = body.community === "minted_merch" ? "minted_merch" : "betr";

    const now = new Date().toISOString();
    const game = await pokerDb.insert("kill_or_keep_games", [
      {
        title: body.title || "KILL OR KEEP",
        status: "open",
        is_preview: !!body.isPreview,
        created_by_fid: fid,
        created_at: now,
        updated_at: now,
        community,
        turn_order_fids: [],
        remaining_fids: [],
        eliminated_fids: [],
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
    console.error("[kill-or-keep/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const games = await pokerDb.fetch<any>("kill_or_keep_games", {
      order: "created_at.desc",
      limit: 100,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: games || [] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[kill-or-keep/games GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch games" }, { status: 500 });
  }
}
