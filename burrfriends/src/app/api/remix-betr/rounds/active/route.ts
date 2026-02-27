/**
 * GET /api/remix-betr/rounds/active - Get active rounds (status='open' or 'closed').
 * Excludes 'settled' and 'cancelled' so closed rounds stay visible for "Submissions closed" and admin settle.
 * Same pattern as GET /api/betr-guesser/games/active
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { autoCloseRemixBetrRounds } from "~/lib/remix-betr-auto-close";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    // Auto-close expired rounds
    await autoCloseRemixBetrRounds();

    // Fetch open and closed (excludes settled, cancelled). pokerDb only supports eq, so two fetches.
    // Phase 36: user-facing always filters to 'betr' community
    const [openRounds, closedRounds] = await Promise.all([
      pokerDb.fetch<Record<string, unknown>>("remix_betr_rounds", {
        filters: { status: "open", community: "betr" },
        order: "submissions_close_at.asc",
        limit: 100,
      }),
      pokerDb.fetch<Record<string, unknown>>("remix_betr_rounds", {
        filters: { status: "closed", community: "betr" },
        order: "submissions_close_at.asc",
        limit: 100,
      }),
    ]);

    const combined = [...(openRounds || []), ...(closedRounds || [])];
    combined.sort((a, b) => 
      new Date(a.submissions_close_at as string).getTime() - new Date(b.submissions_close_at as string).getTime()
    );

    return NextResponse.json<ApiResponse>({ ok: true, data: combined });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[remix-betr/rounds/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active rounds" }, { status: 500 });
  }
}
