/**
 * GET /api/betr-guesser/games/active - Get active games (status='open' or 'closed').
 * Excludes 'settled' and 'cancelled' so closed games stay visible for "Guesses closed" and admin settle.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

// Auto-close games where guesses_close_at passed or min_players reached (per start_condition)
async function autoCloseGames() {
  const openGames = await pokerDb.fetch<{ id: string }>(
    "betr_guesser_games",
    { filters: { status: "open" }, select: "id", limit: 1000 }
  );
  if (!openGames || openGames.length === 0) return 0;
  const { maybeCloseBetrGuesserGame } = await import("~/lib/betr-guesser-auto-close");
  let closed = 0;
  for (const g of openGames) {
    if (await maybeCloseBetrGuesserGame(g.id)) closed++;
  }
  return closed;
}

export async function GET(_req: NextRequest) {
  try {
    // Auto-close expired games
    await autoCloseGames();

    // Fetch open and closed (excludes settled, cancelled). pokerDb only supports eq, so two fetches.
    const [openGames, closedGames] = await Promise.all([
      pokerDb.fetch<any>("betr_guesser_games", {
        filters: { status: "open", community: "betr" }, // Phase 36: user-facing only sees BETR
        order: "guesses_close_at.asc",
        limit: 100,
      }),
      pokerDb.fetch<any>("betr_guesser_games", {
        filters: { status: "closed", community: "betr" }, // Phase 36
        order: "guesses_close_at.asc",
        limit: 100,
      }),
    ]);

    const combined = [...(openGames || []), ...(closedGames || [])];
    combined.sort((a, b) => new Date(a.guesses_close_at).getTime() - new Date(b.guesses_close_at).getTime());

    return NextResponse.json<ApiResponse>({ ok: true, data: combined });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[betr-guesser/games/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active games" }, { status: 500 });
  }
}
