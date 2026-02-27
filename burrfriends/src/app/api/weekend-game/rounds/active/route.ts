/**
 * GET /api/weekend-game/rounds/active
 * Active rounds (status open or closed). Runs auto-close first. Excludes is_preview for production use.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { autoCloseWeekendGameRounds } from "~/lib/weekend-game-auto-close";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    await autoCloseWeekendGameRounds();

    // Phase 36: user-facing always filters to 'betr' community
    const [openRounds, closedRounds] = await Promise.all([
      pokerDb.fetch<Record<string, unknown>>("weekend_game_rounds", {
        filters: { status: "open", community: "betr" },
        order: "submissions_close_at.asc",
        limit: 100,
      }),
      pokerDb.fetch<Record<string, unknown>>("weekend_game_rounds", {
        filters: { status: "closed", community: "betr" },
        order: "submissions_close_at.asc",
        limit: 100,
      }),
    ]);

    const combined = [...(openRounds || []), ...(closedRounds || [])];
    const filtered = combined.filter((r) => r.is_preview !== true);
    filtered.sort(
      (a, b) =>
        new Date(a.submissions_close_at as string).getTime() -
        new Date(b.submissions_close_at as string).getTime()
    );

    return NextResponse.json<ApiResponse>({ ok: true, data: filtered });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[weekend-game/rounds/active GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch active rounds" },
      { status: 500 }
    );
  }
}
