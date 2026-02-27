/**
 * GET /api/superbowl-squares/games/active - Get active Super Bowl Squares games
 * Returns games with status in ('setup', 'claiming', 'locked')
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    // Fetch all non-settled, non-cancelled games
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      order: "created_at.desc",
      limit: 50,
    });

    // Filter to active statuses
    const activeGames = (games || []).filter((g: any) => 
      ['setup', 'claiming', 'locked'].includes(g.status)
    );

    // For each game, get claim counts
    const gamesWithCounts = await Promise.all(
      activeGames.map(async (game: any) => {
        const claims = await pokerDb.fetch<any>("superbowl_squares_claims", {
          filters: { game_id: game.id },
          select: "id,claim_type",
          limit: 100,
        });

        const autoClaims = (claims || []).filter((c: any) => c.claim_type !== 'admin').length;
        const adminClaims = (claims || []).filter((c: any) => c.claim_type === 'admin').length;

        return {
          ...game,
          claimedSquares: claims?.length || 0,
          autoClaims,
          adminClaims,
          availableAutoSquares: game.auto_squares_limit - autoClaims,
          availableAdminSquares: game.admin_squares_limit - adminClaims,
        };
      })
    );

    return NextResponse.json<ApiResponse>({ ok: true, data: gamesWithCounts });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[superbowl-squares/games/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active games" }, { status: 500 });
  }
}
