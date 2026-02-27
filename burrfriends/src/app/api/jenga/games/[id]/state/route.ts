/**
 * GET /api/jenga/games/[id]/state - Get current tower state (for rendering)
 * Includes on-read timeout processing (V1 + V2 handoff, 10s, replace via jenga-on-read-timeout)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";
import { processGameTimeout } from "~/lib/jenga-on-read-timeout";

// Helper to check betr_games_registrations (for spectator mode)
async function requireBetrGamesRegistration(fid: number): Promise<void> {
  const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
    filters: { fid },
    limit: 1,
  });

  if (!registered || registered.length === 0) {
    throw new Error("Register for BETR GAMES first to view this game.");
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    // Check registration for spectator mode (optional auth)
    let fid: number | null = null;
    try {
      const authResult = await requireAuth(req);
      fid = authResult.fid;
      await requireBetrGamesRegistration(fid);
    } catch (authError: any) {
      if (authError?.message?.includes("Register for BETR GAMES")) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Register for BETR GAMES first to view this game." },
          { status: 403 }
        );
      }
      return NextResponse.json<ApiResponse>(
        { ok: false, error: authError?.message || "Authentication required" },
        { status: 401 }
      );
    }

    // Process timeout if needed (on-read check)
    await processGameTimeout(gameId);

    // Fetch game state
    const games = await pokerDb.fetch<{
      tower_state: any;
      current_turn_fid: number | null;
      current_turn_started_at: string | null;
      turn_time_seconds: number;
      status: string;
      last_placement_at: string | null;
    }>("jenga_games", {
      filters: { id: gameId },
      select: "tower_state,current_turn_fid,current_turn_started_at,turn_time_seconds,status,last_placement_at",
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Calculate time remaining for current turn
    let timeRemaining: number | null = null;
    if (game.status === "in_progress" && game.current_turn_started_at && game.current_turn_fid) {
      const turnStart = new Date(game.current_turn_started_at);
      const turnEnd = new Date(turnStart.getTime() + game.turn_time_seconds * 1000);
      const now = new Date();
      const remaining = Math.max(0, Math.floor((turnEnd.getTime() - now.getTime()) / 1000));
      timeRemaining = remaining;
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        towerState: game.tower_state,
        currentTurn: game.current_turn_fid,
        timeRemaining,
        status: game.status,
        lastPlacementAt: game.last_placement_at ?? null,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/state GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game state" }, { status: 500 });
  }
}
