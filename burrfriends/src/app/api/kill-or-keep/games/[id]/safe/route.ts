/**
 * PATCH /api/kill-or-keep/games/[id]/safe - Admin: set which remaining players are marked safe
 * Body: { safeFids: number[] }. All must be in remaining_fids. Only when status = 'in_progress'.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

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
    const safeFids = Array.isArray(body.safeFids)
      ? body.safeFids.map((f: unknown) => Number(f)).filter((f: number) => Number.isInteger(f) && f > 0)
      : [];

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      remaining_fids: unknown[];
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
    const remainingSet = new Set(remainingFids);
    const invalid = safeFids.filter((f: number) => !remainingSet.has(f));
    if (invalid.length > 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Safe FIDs must be remaining players; invalid: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await pokerDb.update("kill_or_keep_games", { id: gameId }, {
      safe_fids: safeFids,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { safeFids },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/safe PATCH]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to update safe list" }, { status: 500 });
  }
}
