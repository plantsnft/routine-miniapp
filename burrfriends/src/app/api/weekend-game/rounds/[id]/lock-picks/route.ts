/**
 * POST /api/weekend-game/rounds/[id]/lock-picks
 * Admin only. Lock winner picks for this round (set picks_locked_at).
 * Round must have 5 settlements. Idempotent if already locked.
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

    const { id: roundId } = await params;

    const roundRows = await pokerDb.fetch<{ id: string; round_label: string | null; picks_locked_at?: string | null }>("weekend_game_rounds", {
      filters: { id: roundId },
      limit: 1,
    });

    if (!roundRows || roundRows.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }

    const roundLabel = roundRows[0].round_label ?? "";
    if (roundLabel === "") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round has no label; cannot verify settlements." }, { status: 400 });
    }

    const settlements = await pokerDb.fetch<{ winner_fid: number }>("weekend_game_settlements", {
      filters: { round_label: roundLabel },
      select: "winner_fid",
      limit: 10,
    });

    if (!settlements || settlements.length !== 5) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Round must have exactly 5 winners to lock picks." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await pokerDb.update("weekend_game_rounds", { id: roundId }, { picks_locked_at: now });

    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Picks locked." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/rounds/[id]/lock-picks POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to lock picks" }, { status: 500 });
  }
}
