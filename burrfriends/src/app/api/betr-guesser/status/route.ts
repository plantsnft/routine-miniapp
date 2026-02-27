/**
 * GET /api/betr-guesser/status - User status for active games
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

    // Get active games
    const activeGames = await pokerDb.fetch<any>("betr_guesser_games", {
      filters: { status: "open" },
      order: "guesses_close_at.asc",
      limit: 10,
    });

    // Get user's guesses for active games
    // Note: pokerDb.fetch doesn't support array filters, so we fetch all user guesses and filter in JS
    const gameIds = (activeGames || []).map((g: any) => g.id);
    const gameIdsSet = new Set(gameIds);
    const allUserGuesses = gameIds.length > 0
      ? await pokerDb.fetch<{ game_id: string; guess: number }>("betr_guesser_guesses", {
          filters: { fid },
          select: "game_id,guess",
          limit: 1000,
        })
      : [];

    // Filter to only guesses for active games
    const userGuesses = (allUserGuesses || []).filter((g) => gameIdsSet.has(g.game_id));

    const guessMap = new Map<string, number>();
    for (const g of userGuesses) {
      guessMap.set(g.game_id, g.guess);
    }

    const statusData = (activeGames || []).map((game: any) => ({
      gameId: game.id,
      gameStatus: game.status,
      guessesCloseAt: game.guesses_close_at,
      hasGuessed: guessMap.has(game.id),
      myGuess: guessMap.get(game.id) || null,
    }));

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered: isRegistered,
        activeGames: statusData,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch status" }, { status: 500 });
  }
}
