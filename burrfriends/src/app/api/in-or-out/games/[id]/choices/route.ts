/**
 * GET /api/in-or-out/games/[id]/choices - Admin view of all choices
 * Returns list of choices plus quitterCount and amountPerQuitter (10M / quitterCount).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const AMOUNT_POOL = 10_000_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    const games = await pokerDb.fetch<{ id: string }>("in_or_out_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const choices = await pokerDb.fetch<{ game_id: string; fid: number; choice: string; updated_at: string }>(
      "in_or_out_choices",
      { filters: { game_id: gameId } }
    );

    const list = choices || [];
    const quitterCount = list.filter((c) => c.choice === "quit").length;
    const amountPerQuitter = quitterCount > 0 ? Math.floor(AMOUNT_POOL / quitterCount) : 0;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        choices: list.map((c) => ({ fid: c.fid, choice: c.choice, updated_at: c.updated_at })),
        quitterCount,
        amountPerQuitter,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[in-or-out/games/[id]/choices GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch choices" }, { status: 500 });
  }
}
