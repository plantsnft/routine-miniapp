/**
 * POST /api/bullied/games/[id]/deploy-roulette-wheel - Admin deploys Roulette Wheel for a game (once per game)
 *
 * Sets roulette_wheel_deployed_at = now() on the game. Idempotent.
 * After this, every group in the game sees the "Use Roulette Wheel" option.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    // Fetch game
    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      roulette_wheel_deployed_at: string | null;
    }>("bullied_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game must be in_progress to deploy roulette wheel" }, { status: 400 });
    }

    // Idempotent: already deployed
    if (game.roulette_wheel_deployed_at) {
      return NextResponse.json<ApiResponse>({ ok: true, data: { roulette_wheel_deployed_at: game.roulette_wheel_deployed_at } });
    }

    const now = new Date().toISOString();
    await pokerDb.update("bullied_games", { id: gameId }, {
      roulette_wheel_deployed_at: now,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: { roulette_wheel_deployed_at: now } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[bullied/games/[id]/deploy-roulette-wheel POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to deploy roulette wheel" }, { status: 500 });
  }
}
