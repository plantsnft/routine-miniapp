/**
 * POST /api/take-from-the-pile/games/[id]/preload - Set or clear preload amount (queue players only).
 * Caller must be in turn order and not current. If amount is 0 or omitted, deletes preload; else upserts. Phase 37.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const body = await req.json().catch(() => ({}));
    const amount = typeof body.amount === "number" ? body.amount : body.amount == null ? 0 : NaN;
    if (typeof amount !== "number" || isNaN(amount) || amount < 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "amount must be a non-negative number" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      turn_order_fids: number[];
    }>("take_from_the_pile_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Preload is only available when the game is in progress" }, { status: 400 });
    }

    const turnOrderFids = (game.turn_order_fids || []) as number[];
    const currentTurnFid = turnOrderFids.length > 0 ? Number(turnOrderFids[0]) : null;
    const inQueue = turnOrderFids.some((f) => Number(f) === fid);
    const isCurrent = currentTurnFid === fid;

    if (!inQueue || isCurrent) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Only players in the turn queue (not currently your turn) can set a preload" }, { status: 403 });
    }

    const now = new Date().toISOString();

    if (amount === 0) {
      await pokerDb.delete("take_from_the_pile_preloads", { game_id: gameId, fid: Number(fid) });
      return NextResponse.json<ApiResponse>({ ok: true, data: { preloadAmount: null } });
    }

    await pokerDb.upsert("take_from_the_pile_preloads", [
      { game_id: gameId, fid: Number(fid), preload_amount: amount, updated_at: now },
    ]);
    return NextResponse.json<ApiResponse>({ ok: true, data: { preloadAmount: amount } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[take-from-the-pile/games/[id]/preload POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to set preload" }, { status: 500 });
  }
}
