/**
 * GET /api/weekend-game/rounds/settled
 * Returns settled rounds (id, round_label) for picks dropdown / history.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const rounds = await pokerDb.fetch<{ id: string; round_label: string | null }>("weekend_game_rounds", {
      filters: { status: "settled" },
      select: "id,round_label",
      order: "settled_at.desc",
      limit: 50,
    });
    return NextResponse.json<ApiResponse>({ ok: true, data: rounds || [] });
  } catch (e: unknown) {
    console.error("[weekend-game/rounds/settled GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: (e as Error)?.message || "Failed to fetch settled rounds" },
      { status: 500 }
    );
  }
}
