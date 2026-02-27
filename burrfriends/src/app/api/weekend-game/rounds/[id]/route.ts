/**
 * GET /api/weekend-game/rounds/[id] - Get a single WEEKEND GAME round by ID
 *
 * Phase 30: Enables preview game testing. Fetches by ID without is_preview
 * filtering so preview rounds are playable via direct URL (?roundId=xxx).
 * WeekendGameClient uses this when roundId is present in the URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roundId } = await params;

    const rounds = await pokerDb.fetch<any>("weekend_game_rounds", {
      filters: { id: roundId },
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Round not found" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: rounds[0] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[weekend-game/rounds/[id] GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch round" },
      { status: 500 }
    );
  }
}
