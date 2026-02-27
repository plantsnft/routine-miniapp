/**
 * POST /api/superbowl-squares/games/[id]/start - Start claiming phase (admin only)
 * Phase 23.3: Tier 1 + Tier 2 share same 12h window, Tier 3 opens after 12h
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

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game ID required" }, { status: 400 });
    }

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "setup") {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Cannot start game in ${game.status} status. Must be in 'setup' status.` 
      }, { status: 400 });
    }

    // Parse optional window duration (default 12 hours = 720 minutes)
    const body = await req.json().catch(() => ({}));
    const windowMs = (body.windowDurationMinutes ?? 720) * 60 * 1000; // Default 12 hours

    const now = new Date();
    const windowClose = new Date(now.getTime() + windowMs);

    // Tier 1 + Tier 2 share the same window (first 12h)
    // Tier 3 opens when window 1 closes (no close time — runs until admin locks)
    const tier1Opens = now;
    const tier1Closes = windowClose;
    const tier2Opens = now;
    const tier2Closes = windowClose;
    const tier3Opens = new Date('2026-02-07T10:00:00-05:00'); // Feb 7 2026, 10 AM EST

    // Update game to claiming status with tier windows
    const updated = await pokerDb.update(
      "superbowl_squares_games",
      { id: gameId },
      {
        status: "claiming",
        tier1_opens_at: tier1Opens.toISOString(),
        tier1_closes_at: tier1Closes.toISOString(),
        tier2_opens_at: tier2Opens.toISOString(),
        tier2_closes_at: tier2Closes.toISOString(),
        tier3_opens_at: tier3Opens.toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: "Claiming phase started",
        window1: { opens: tier1Opens.toISOString(), closes: tier1Closes.toISOString(), tiers: 'Tier 1 (200M+) + Tier 2 (100M+)' },
        window2: { opens: tier3Opens.toISOString(), tiers: 'Tier 3 (50M+)' },
        game: updated[0] || { id: gameId, status: "claiming" },
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-squares/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
