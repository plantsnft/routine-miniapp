/**
 * POST /api/nl-holdem/games/[id]/start - Start game (admin only).
 * Shuffle seats with crypto; if is_preview add admin to eligible. Phase 40.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { isGlobalAdmin } from "~/lib/permissions";
import { hasBetaAccess } from "~/lib/beta";
import { pokerDb } from "~/lib/pokerDb";
import { startGameWhenFull } from "~/lib/nlHoldemStart";
import { initPlayForGame } from "~/lib/nlHoldemPlay";
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

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      is_preview?: boolean;
    }>("nl_holdem_games", {
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

    let signups = await pokerDb.fetch<{ fid: number }>("nl_holdem_signups", {
      filters: { game_id: gameId },
      select: "fid",
      limit: 20,
    });
    let signupFids = (signups || []).map((s) => Number(s.fid));

    if (game.is_preview === true && (isGlobalAdmin(fid) || hasBetaAccess(req)) && !signupFids.includes(fid)) {
      const now = new Date().toISOString();
      await pokerDb.insert("nl_holdem_signups", [{ game_id: gameId, fid, joined_at: now }]);
      signupFids = [fid, ...signupFids];
    }

    if (signupFids.length < 2) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "At least 2 players are required to start." }, { status: 400 });
    }

    const seatOrderFids = await startGameWhenFull(gameId, signupFids, game.is_preview === true);
    if (seatOrderFids) {
      await initPlayForGame(gameId);
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { gameId, status: "in_progress", seatOrderFids: seatOrderFids ?? signupFids },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[nl-holdem/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
