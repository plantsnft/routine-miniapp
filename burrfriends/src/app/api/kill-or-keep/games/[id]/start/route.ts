/**
 * POST /api/kill-or-keep/games/[id]/start - Start game (admin only)
 * Requires turn_order_fids to be set. Sets remaining_fids = turn_order_fids, current_turn_fid = first, status = in_progress.
 * If !is_preview: game started to all in turn_order_fids, your turn to current_turn_fid. If is_preview add admin to eligible when needed.
 * Phase 38.
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
      turn_order_fids: number[];
    }>("kill_or_keep_games", {
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

    let turnOrderFids = (game.turn_order_fids || []).map((f: unknown) => Number(f)) as number[];
    if (turnOrderFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Set order before starting (PATCH /order with turnOrderFids)" }, { status: 400 });
    }

    if (game.is_preview === true && (isGlobalAdmin(fid) || hasBetaAccess(req)) && !turnOrderFids.includes(fid)) {
      turnOrderFids = [fid, ...turnOrderFids];
      await pokerDb.update("kill_or_keep_games", { id: gameId }, {
        turn_order_fids: turnOrderFids,
        updated_at: new Date().toISOString(),
      });
    }

    const remainingFids = [...turnOrderFids];
    const currentTurnFid = remainingFids[0];
    const now = new Date().toISOString();

    const currentTurnEndsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await pokerDb.update("kill_or_keep_games", { id: gameId }, {
      status: "in_progress",
      updated_at: now,
      remaining_fids: remainingFids,
      eliminated_fids: [],
      current_turn_fid: currentTurnFid,
      safe_fids: [currentTurnFid],
      current_turn_ends_at: currentTurnEndsAt,
    });

    if (game.is_preview !== true) {
      const targetUrl = `${APP_URL}/kill-or-keep?gameId=${gameId}`;
      for (const f of turnOrderFids) {
        const notificationId = `kill_or_keep_game_started:${gameId}:${f}`.slice(0, 128);
        sendNotificationToFid(
          f,
          {
            title: "KILL OR KEEP",
            body: "The game has started. Open the app to see when it's your turn.",
            targetUrl,
          },
          notificationId
        ).catch((err) => console.error("[kill-or-keep/start] push game started failed:", err));
      }
      const turnNotificationId = `kill_or_keep_turn:${gameId}:${currentTurnFid}`.slice(0, 128);
      sendNotificationToFid(
        currentTurnFid,
        {
          title: "KILL OR KEEP",
          body: "It's your turn — Keep or Kill one player.",
          targetUrl: `${APP_URL}/kill-or-keep?gameId=${gameId}`,
        },
        turnNotificationId
      ).catch((err) => console.error("[kill-or-keep/start] push your turn failed:", err));
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { gameId, status: "in_progress", currentTurnFid },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
