/**
 * POST /api/kill-or-keep/games/[id]/end - End game (admin only). Set status = settled.
 * Phase 38.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    const games = await pokerDb.fetch<{ id: string; status: string }>("kill_or_keep_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    if (games[0].status !== "open" && games[0].status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is already ended" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await pokerDb.update("kill_or_keep_games", { id: gameId }, {
      status: "settled",
      current_turn_fid: null,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: { gameId, status: "settled" } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/end POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to end game" }, { status: 500 });
  }
}
