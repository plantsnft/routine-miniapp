/**
 * GET /api/remix-betr/rounds/[id] - Get a single FRAMEDL BETR round by ID
 *
 * Phase 29: Enables preview game testing. Individual game detail routes
 * (e.g. /api/buddy-up/games/[id]) fetch by ID without is_preview filtering,
 * so preview games are playable via direct URL. FRAMEDL BETR lacked this
 * route — this fills the gap so RemixBetrClient can load a specific round
 * via ?roundId=xxx.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roundId } = await params;

    const rounds = await pokerDb.fetch<any>("remix_betr_rounds", {
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
    console.error("[remix-betr/rounds/[id] GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch round" },
      { status: 500 }
    );
  }
}
