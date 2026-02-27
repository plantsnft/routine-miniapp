/**
 * POST /api/take-from-the-pile/games/[id]/settle - Aggregate picks by fid, insert settlements (admin only)
 * No on-chain pay; manual payout. Phase 37.
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

    const games = await pokerDb.fetch<{ id: string; status: string }>("take_from_the_pile_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    if (games[0].status !== "settled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game must be ended (settled) before running settle" }, { status: 400 });
    }

    const picks = await pokerDb.fetch<{ fid: number; amount_taken: number }>("take_from_the_pile_picks", {
      filters: { game_id: gameId },
      select: "fid,amount_taken",
      limit: 10000,
    });

    const byFid = new Map<number, number>();
    for (const p of picks || []) {
      const f = Number(p.fid);
      const amt = Number(p.amount_taken) || 0;
      if (amt > 0) {
        byFid.set(f, (byFid.get(f) ?? 0) + amt);
      }
    }

    const existing = await pokerDb.fetch<{ id: string }>("take_from_the_pile_settlements", {
      filters: { game_id: gameId },
      limit: 1,
    });
    if (existing && existing.length > 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Already settled", settlements: Array.from(byFid.entries()).map(([fid, amount]) => ({ fid, amount })) } });
    }

    const rows = Array.from(byFid.entries()).map(([fid, amount]) => ({
      game_id: gameId,
      fid,
      amount,
    }));
    if (rows.length > 0) {
      await pokerDb.insert("take_from_the_pile_settlements", rows);
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { settlements: Array.from(byFid.entries()).map(([fid, amount]) => ({ fid, amount })) },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[take-from-the-pile/games/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle" }, { status: 500 });
  }
}
