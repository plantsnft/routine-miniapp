/**
 * GET /api/jenga/status - Get user status for active games
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Check registration (Phase 29.1: admins always count as registered)
    const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
      filters: { fid },
      limit: 1,
    });
    const isRegistered = (registered || []).length > 0 || isGlobalAdmin(fid);

    // Find active games (signup or in_progress)
    const activeGames = await pokerDb.fetch<any>("jenga_games", {
      filters: { status: "signup" },
      order: "created_at.desc",
      limit: 10,
    });

    const inProgressGames = await pokerDb.fetch<any>("jenga_games", {
      filters: { status: "in_progress" },
      order: "created_at.desc",
      limit: 10,
    });

    const allActive = [...(activeGames || []), ...(inProgressGames || [])];
    const uniqueGames = Array.from(new Map(allActive.map((g) => [g.id, g])).values());

    // Find user's signup and game status
    let hasSignedUp = false;
    let gameId: string | null = null;
    let gameStatus: string | null = null;
    let isMyTurn = false;
    let timeRemaining: number | null = null;

    if (uniqueGames.length > 0) {
      // Check signups for the most recent active game
      const mostRecentGame = uniqueGames[0];
      gameId = mostRecentGame.id;
      gameStatus = mostRecentGame.status;

      const signups = await pokerDb.fetch<{ fid: number }>("jenga_signups", {
        filters: { game_id: gameId || '', fid },
        limit: 1,
      });

      hasSignedUp = (signups || []).length > 0;

      // If in progress, check if it's user's turn
      if (gameStatus === "in_progress" && hasSignedUp) {
        isMyTurn = mostRecentGame.current_turn_fid === fid;

        if (mostRecentGame.current_turn_started_at && mostRecentGame.current_turn_fid === fid) {
          const turnStart = new Date(mostRecentGame.current_turn_started_at);
          const turnEnd = new Date(turnStart.getTime() + mostRecentGame.turn_time_seconds * 1000);
          const now = new Date();
          const remaining = Math.max(0, Math.floor((turnEnd.getTime() - now.getTime()) / 1000));
          timeRemaining = remaining;
        }
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered: isRegistered,
        hasSignedUp,
        gameId,
        gameStatus,
        isMyTurn,
        timeRemaining,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get status" }, { status: 500 });
  }
}
