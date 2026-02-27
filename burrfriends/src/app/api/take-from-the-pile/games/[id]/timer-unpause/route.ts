/**
 * PATCH /api/take-from-the-pile/games/[id]/timer-unpause - Unpause turn timer (admin only)
 * Restore current_turn_ends_at from timer_paused_remaining_seconds. Phase 37.
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

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      timer_paused_at: string | null;
      timer_paused_remaining_seconds: number | null;
    }>("take_from_the_pile_games", {
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
    if (!game.timer_paused_at) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Timer is not paused" }, { status: 400 });
    }

    const remaining = game.timer_paused_remaining_seconds ?? 0;
    const newEndsAt = new Date(Date.now() + remaining * 1000).toISOString();
    const now = new Date().toISOString();

    await pokerDb.update("take_from_the_pile_games", { id: gameId }, {
      current_turn_ends_at: newEndsAt,
      timer_paused_at: null,
      timer_paused_remaining_seconds: null,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { unpaused: true, current_turn_ends_at: newEndsAt },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[take-from-the-pile/games/[id]/timer-unpause PATCH]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to unpause" }, { status: 500 });
  }
}
