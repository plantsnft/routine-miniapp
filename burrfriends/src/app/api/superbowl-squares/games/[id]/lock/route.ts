/**
 * POST /api/superbowl-squares/games/[id]/lock - Lock the grid (stop claiming)
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

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "claiming") {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Cannot lock game in ${game.status} status. Must be in 'claiming' status.` 
      }, { status: 400 });
    }

    // Update game to locked status
    const updated = await pokerDb.update(
      "superbowl_squares_games",
      { id: gameId },
      {
        status: "locked",
        updated_at: new Date().toISOString(),
      }
    );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: "Grid locked. No more claims allowed. Ready for randomization.",
        game: updated[0] || { id: gameId, status: "locked" },
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-squares/games/[id]/lock POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to lock game" }, { status: 500 });
  }
}
