/**
 * POST /api/steal-no-steal/games/[id]/cancel - Cancel game (admin only)
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

    if (game.status === "settled" || game.status === "cancelled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is already finished" }, { status: 400 });
    }

    // Cancel the game
    const now = new Date().toISOString();
    await pokerDb.update("steal_no_steal_games", { id: gameId }, {
      status: "cancelled",
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({ ok: true, message: "Game cancelled" });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games/[id]/cancel POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to cancel game" }, { status: 500 });
  }
}
