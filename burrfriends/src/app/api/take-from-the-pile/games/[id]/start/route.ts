/**
 * POST /api/take-from-the-pile/games/[id]/start - Start game (admin only)
 * Shuffle alive players (community 'betr'), set turn_order_fids, current_turn_ends_at, send push to first.
 * If is_preview add admin FID to eligible. Phase 37.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { isGlobalAdmin } from "~/lib/permissions";
import { hasBetaAccess } from "~/lib/beta";
import { pokerDb } from "~/lib/pokerDb";
import { APP_URL } from "~/lib/constants";
import { sendNotificationToFid } from "~/lib/notifications";
import type { ApiResponse } from "~/lib/types";

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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
      prize_pool_amount: number;
      pick_deadline_minutes: number;
    }>("take_from_the_pile_games", {
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
      filters: { status: "alive", community: "betr" },
      select: "fid",
      limit: 10000,
    });
    let eligibleFids = (alivePlayers || []).map((p) => Number(p.fid));
    if (game.is_preview === true && (isGlobalAdmin(fid) || hasBetaAccess(req)) && !eligibleFids.includes(fid)) {
      eligibleFids = [...eligibleFids, fid];
    }

    if (eligibleFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No eligible players found" }, { status: 400 });
    }

    const turnOrderFids = shuffleArray(eligibleFids);
    const now = new Date();
    const deadlineMinutes = game.pick_deadline_minutes ?? 60;
    const currentTurnEndsAt = new Date(now.getTime() + deadlineMinutes * 60 * 1000).toISOString();

    await pokerDb.update("take_from_the_pile_games", { id: gameId }, {
      status: "in_progress",
      updated_at: now.toISOString(),
      turn_order_fids: turnOrderFids,
      current_pot_amount: Number(game.prize_pool_amount),
      current_turn_ends_at: currentTurnEndsAt,
    });

    const firstFid = turnOrderFids[0];
    if (game.is_preview !== true) {
      const targetUrl = `${APP_URL}/take-from-the-pile?gameId=${gameId}`;
      const notificationId = `take_from_the_pile_turn:${gameId}:${firstFid}`.slice(0, 128);
      sendNotificationToFid(
        firstFid,
        {
          title: "TAKE FROM THE PILE",
          body: "It's your turn to take from the pile.",
          targetUrl,
        },
        notificationId
      ).catch((err) => console.error("[take-from-the-pile/start] push failed:", err));
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { gameId, status: "in_progress", current_turn_ends_at: currentTurnEndsAt },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[take-from-the-pile/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
