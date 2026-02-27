/**
 * GET /api/jenga/games/active - Get active games (signup or in_progress)
 * PUBLIC ENDPOINT - NO AUTH REQUIRED
 *
 * Backwards-compatible route: same behavior as /api/jenga/active.
 * Kept so any client still using the old path gets 200 instead of 401.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const games = await pokerDb.fetch<any>("jenga_games", {
      filters: { status: "signup", community: "betr" }, // Phase 36: user-facing only sees BETR
      order: "created_at.desc",
      limit: 10,
    });

    const inProgress = await pokerDb.fetch<any>("jenga_games", {
      filters: { status: "in_progress", community: "betr" }, // Phase 36
      order: "created_at.desc",
      limit: 10,
    });

    const allActive = [...(games || []), ...(inProgress || [])];

    return NextResponse.json<ApiResponse>({ ok: true, data: allActive });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[jenga/games/active GET] ERROR:", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active games" }, { status: 500 });
  }
}
