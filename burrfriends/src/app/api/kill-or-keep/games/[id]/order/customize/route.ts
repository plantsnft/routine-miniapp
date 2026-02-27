/**
 * POST /api/kill-or-keep/games/[id]/order/customize - Admin: reorder remaining players (in_progress)
 * Body: { turnOrderFids: number[] } — must exactly match remaining_fids (same set, just reordered).
 * Sets turn_order_fids, current_turn_fid = first, current_turn_ends_at = now+60min. Phase 38.
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
    const submitted = Array.isArray(body.turnOrderFids)
      ? (body.turnOrderFids as unknown[]).map((f) => Number(f)).filter(Number.isFinite)
      : [];

    if (submitted.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "turnOrderFids must be a non-empty array of FIDs" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      remaining_fids: number[];
    }>("kill_or_keep_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game must be in_progress to customize order" }, { status: 400 });
    }

    const remainingFids = (game.remaining_fids || []).map((f: unknown) => Number(f)) as number[];

    // Validate: submitted FIDs must exactly match remaining_fids (same set)
    if (submitted.length !== remainingFids.length) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: `Submitted ${submitted.length} FIDs but there are ${remainingFids.length} remaining players. Must include all remaining players.`,
      }, { status: 400 });
    }
    const remainingSet = new Set(remainingFids);
    for (const f of submitted) {
      if (!remainingSet.has(f)) {
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: `FID ${f} is not in the remaining players list`,
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const currentTurnEndsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await pokerDb.update("kill_or_keep_games", { id: gameId }, {
      turn_order_fids: submitted,
      current_turn_fid: submitted[0],
      current_turn_ends_at: currentTurnEndsAt,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { turnOrderFids: submitted, currentTurnFid: submitted[0] },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/order/customize POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to customize order" }, { status: 500 });
  }
}
