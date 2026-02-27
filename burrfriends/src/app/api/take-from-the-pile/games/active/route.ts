/**
 * GET /api/take-from-the-pile/games/active - Get active games (open + in_progress), excluding previews
 * Phase 36: community 'betr' for user-facing.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const openGames = await pokerDb.fetch<any>("take_from_the_pile_games", {
      filters: { status: "open", community: "betr" },
      order: "created_at.desc",
      limit: 10,
    });

    const inProgress = await pokerDb.fetch<any>("take_from_the_pile_games", {
      filters: { status: "in_progress", community: "betr" },
      order: "created_at.desc",
      limit: 10,
    });

    const allActive = [...(openGames || []), ...(inProgress || [])];
    const filtered = allActive.filter((g: { is_preview?: boolean }) => g.is_preview !== true);

    return NextResponse.json<ApiResponse>({ ok: true, data: filtered });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[take-from-the-pile/games/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active games" }, { status: 500 });
  }
}
