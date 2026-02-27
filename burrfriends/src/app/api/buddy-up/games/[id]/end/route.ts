/**
 * POST /api/buddy-up/games/[id]/end - End game (admin only)
 * Sets status to 'settled' (or 'cancelled' if body.cancel is true)
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
    const body = await req.json().catch(() => ({}));
    const cancel = body.cancel === true;

    // Check game exists
    const games = await pokerDb.fetch<{ id: string; status: string }>("buddy_up_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status === "settled" || game.status === "cancelled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is already ended" }, { status: 400 });
    }

    // Update game status
    const now = new Date().toISOString();
    const newStatus = cancel ? "cancelled" : "settled";
    await pokerDb.update("buddy_up_games", { id: gameId }, { status: newStatus, updated_at: now });

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: cancel ? "Game cancelled" : "Game ended",
      data: { gameId, status: newStatus },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/end POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to end game" }, { status: 500 });
  }
}
