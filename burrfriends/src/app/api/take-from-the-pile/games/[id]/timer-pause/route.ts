/**
 * PATCH /api/take-from-the-pile/games/[id]/timer-pause - Pause turn timer (admin only)
 * Phase 37.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    const games = await pokerDb.fetch<{ id: string; status: string; current_turn_ends_at: string | null }>("take_from_the_pile_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    const game = games[0];
    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    const endsAt = game.current_turn_ends_at ? new Date(game.current_turn_ends_at).getTime() : null;
    const remainingSeconds = endsAt != null && endsAt > Date.now() ? Math.max(0, Math.floor((endsAt - Date.now()) / 1000)) : 0;

    const now = new Date().toISOString();
    await pokerDb.update("take_from_the_pile_games", { id: gameId }, {
      timer_paused_at: now,
      timer_paused_remaining_seconds: remainingSeconds,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { paused: true, remainingSeconds },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[take-from-the-pile/games/[id]/timer-pause PATCH]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to pause" }, { status: 500 });
  }
}
