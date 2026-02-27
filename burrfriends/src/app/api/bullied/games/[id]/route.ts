/**
 * GET /api/bullied/games/[id] - Get game detail by ID
 * No is_preview filter so preview games are playable by direct URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    const games = await pokerDb.fetch<any>("bullied_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: games[0] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[bullied/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
