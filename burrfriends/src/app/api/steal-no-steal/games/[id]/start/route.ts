/**
 * POST /api/steal-no-steal/games/[id]/start - Start game (admin only)
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

    // Get game
    const games = await pokerDb.fetch<{ id: string; status: string }>("steal_no_steal_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "signup") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in signup phase" }, { status: 400 });
    }

    // Check we have at least 2 signups
    const signups = await pokerDb.fetch<{ fid: number }>("steal_no_steal_signups", {
      filters: { game_id: gameId },
      limit: 100,
    });

    if (!signups || signups.length < 2) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Need at least 2 players to start" }, { status: 400 });
    }

    // Start the game
    const now = new Date().toISOString();
    await pokerDb.update("steal_no_steal_games", { id: gameId }, {
      status: "in_progress",
      started_at: now,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Game started!",
      data: { gameId, status: "in_progress", signupCount: signups.length },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
