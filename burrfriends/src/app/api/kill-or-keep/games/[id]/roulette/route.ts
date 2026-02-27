/**
 * POST /api/kill-or-keep/games/[id]/roulette - Admin: eliminate one random player from remaining (Russian Roulette)
 * One elimination per call. If remaining <= 10 after, set status = settled. Phase 38.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { randomInt } from "crypto";
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

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      remaining_fids: number[];
      eliminated_fids: number[];
    }>("kill_or_keep_games", {
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

    const remainingFids = (game.remaining_fids || []).map((f: unknown) => Number(f)) as number[];
    if (remainingFids.length <= 10) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Remaining already 10 or fewer; use End game or no roulette needed" }, { status: 400 });
    }

    const idx = randomInt(0, remainingFids.length);
    const eliminatedFid = remainingFids[idx];
    const newRemaining = remainingFids.filter((_, i) => i !== idx);
    const newEliminated = [...(game.eliminated_fids || []).map((f: unknown) => Number(f)), eliminatedFid];

    const existingActions = await pokerDb.fetch<{ sequence: number }>("kill_or_keep_actions", {
      filters: { game_id: gameId },
      select: "sequence",
      limit: 10000,
    });
    const maxSeq = (existingActions || []).length > 0 ? Math.max(...(existingActions || []).map((e) => Number(e.sequence))) : 0;
    const nextSeq = maxSeq + 1;
    const now = new Date().toISOString();

    await pokerDb.insert("kill_or_keep_actions", [
      { game_id: gameId, sequence: nextSeq, actor_fid: 0, action: "roulette", target_fid: eliminatedFid, created_at: now },
    ]);

    const shouldSettle = newRemaining.length <= 10;
    await pokerDb.update("kill_or_keep_games", { id: gameId }, {
      remaining_fids: newRemaining,
      eliminated_fids: newEliminated,
      updated_at: now,
      ...(shouldSettle ? { status: "settled", current_turn_fid: null } : {}),
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { eliminatedFid, remainingCount: newRemaining.length, settled: shouldSettle },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/roulette POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to run roulette" }, { status: 500 });
  }
}
