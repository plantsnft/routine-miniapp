/**
 * POST /api/in-or-out/games/[id]/start - Start game (admin only)
 * Sets status to in_progress and room_timer_ends_at = now + 24h.
 * No groups; eligible players are from betr_games_tournament_players (alive). Preview: add admin FID.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { isGlobalAdmin } from "~/lib/permissions";
import { hasBetaAccess } from "~/lib/beta";
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

    const games = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("in_or_out_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in open phase" }, { status: 400 });
    }

    const alivePlayers = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
      filters: { status: "alive" },
    });
    let eligibleCount = (alivePlayers || []).length;
    if (game.is_preview === true && (isGlobalAdmin(fid) || hasBetaAccess(req))) {
      const eligibleFids = (alivePlayers || []).map((p) => Number(p.fid));
      if (!eligibleFids.includes(fid)) eligibleCount += 1;
    }

    if (eligibleCount === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No eligible players found" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const roomTimerEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await pokerDb.update("in_or_out_games", { id: gameId }, {
      status: "in_progress",
      updated_at: now,
      room_timer_ends_at: roomTimerEndsAt,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { gameId, status: "in_progress", room_timer_ends_at: roomTimerEndsAt },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[in-or-out/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
