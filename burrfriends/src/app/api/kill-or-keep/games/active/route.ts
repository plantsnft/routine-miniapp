/**
 * GET /api/kill-or-keep/games/active - Get active games (open + in_progress), excluding previews
 * Phase 38. Community 'betr' for user-facing.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const openGames = await pokerDb.fetch<any>("kill_or_keep_games", {
      filters: { status: "open", community: "betr" },
      order: "created_at.desc",
      limit: 10,
    });

    const inProgress = await pokerDb.fetch<any>("kill_or_keep_games", {
      filters: { status: "in_progress", community: "betr" },
      order: "created_at.desc",
      limit: 10,
    });

    const allActive = [...(openGames || []), ...(inProgress || [])];
    const filtered = allActive.filter((g: { is_preview?: boolean }) => g.is_preview !== true);

    return NextResponse.json<ApiResponse>({ ok: true, data: filtered });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[kill-or-keep/games/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active games" }, { status: 500 });
  }
}
