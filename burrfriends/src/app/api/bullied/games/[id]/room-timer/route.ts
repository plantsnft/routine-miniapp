/**
 * PATCH /api/bullied/games/[id]/room-timer - Set room countdown end time (admin only)
 * Phase 33.11. Body: { minutes: number }. Game must be in_progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const MIN_MINUTES = 1;
const MAX_MINUTES = 10080; // 7 days

export async function PATCH(
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
    const minutes = typeof body.minutes === "number" ? body.minutes : Number(body.minutes);

    if (!Number.isFinite(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `minutes must be a number between ${MIN_MINUTES} and ${MAX_MINUTES}` },
        { status: 400 }
      );
    }

    const games = await pokerDb.fetch<{ id: string; status: string }>("bullied_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    if (games[0].status !== "in_progress") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game must be in progress to set room timer" },
        { status: 400 }
      );
    }

    const newEnd = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    await pokerDb.update("bullied_games", { id: gameId }, {
      room_timer_ends_at: newEnd,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { room_timer_ends_at: newEnd },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[bullied/games/[id]/room-timer PATCH]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to set room timer" }, { status: 500 });
  }
}
