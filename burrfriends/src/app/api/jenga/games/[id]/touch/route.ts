/**
 * POST /api/jenga/games/[id]/touch — Next-player takeover during 10s handoff (V2)
 * When within 10s of last placement and it's the next player's turn to start, touch ends the handoff and sets current_turn_started_at = now().
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isTowerStateV2 } from "~/lib/jenga-tower-state-v2";
import type { ApiResponse } from "~/lib/types";

const HANDOFF_SECONDS = 10;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      current_turn_fid: number | null;
      current_turn_started_at: string | null;
      last_placement_at: string | null;
      tower_state: unknown;
    }>("jenga_games", {
      filters: { id: gameId },
      select: "id,status,current_turn_fid,current_turn_started_at,last_placement_at,tower_state",
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const g = games[0];
    if (g.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    if (!isTowerStateV2(g.tower_state)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Touch is only for V2 games" }, { status: 400 });
    }

    // Handoff: current_turn_started_at is null and we're within 10s of last_placement_at
    if (g.current_turn_started_at != null) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Not in handoff; turn already started" }, { status: 400 });
    }

    if (!g.last_placement_at) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No last placement (handoff not active)" }, { status: 400 });
    }

    const lastPlace = new Date(g.last_placement_at).getTime();
    const now = Date.now();
    if (now > lastPlace + HANDOFF_SECONDS * 1000) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Handoff window (10s) has elapsed" }, { status: 400 });
    }

    if (g.current_turn_fid !== fid) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "It is not your turn to touch" }, { status: 400 });
    }

    await pokerDb.update(
      "jenga_games",
      { id: gameId },
      { current_turn_started_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    );

    return NextResponse.json<ApiResponse>({ ok: true });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/touch POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to touch" }, { status: 500 });
  }
}
