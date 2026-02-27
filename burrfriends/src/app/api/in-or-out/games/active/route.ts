/**
 * GET /api/in-or-out/games/active - Get active games (open + in_progress), excluding previews
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const openGames = await pokerDb.fetch<any>("in_or_out_games", {
      filters: { status: "open", community: "betr" }, // Phase 36: user-facing only sees BETR
      order: "created_at.desc",
      limit: 10,
    });

    const inProgress = await pokerDb.fetch<any>("in_or_out_games", {
      filters: { status: "in_progress", community: "betr" }, // Phase 36
      order: "created_at.desc",
      limit: 10,
    });

    const allActive = [...(openGames || []), ...(inProgress || [])];
    const filtered = allActive.filter((g: { is_preview?: boolean }) => g.is_preview !== true);

    return NextResponse.json<ApiResponse>({ ok: true, data: filtered });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[in-or-out/games/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active games" }, { status: 500 });
  }
}
