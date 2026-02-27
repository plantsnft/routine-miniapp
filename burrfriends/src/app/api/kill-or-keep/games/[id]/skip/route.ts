/**
 * POST /api/kill-or-keep/games/[id]/skip - Admin: skip current player's turn
 * Advances to next player in line; does not move skipped player to back (turn_order_fids unchanged).
 * Inserts 'skip' action (actor_fid=0, target_fid=skipped). Phase 38.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
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
      remaining_fids: number[];
      current_turn_fid: number | null;
    }>("kill_or_keep_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    const currentTurnFid = game.current_turn_fid != null ? Number(game.current_turn_fid) : null;
    if (currentTurnFid == null) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No current turn set" }, { status: 400 });
    }

    const turnOrderFids = (game.turn_order_fids || []).map((f: unknown) => Number(f)) as number[];
    const remainingFids = (game.remaining_fids || []).map((f: unknown) => Number(f)) as number[];

    // Remaining players in current turn order; next = person after current, wrap
    const orderInRemaining = turnOrderFids.filter((f) => remainingFids.includes(f));
    if (orderInRemaining.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No remaining players to advance to" }, { status: 400 });
    }
    const currentIdx = orderInRemaining.indexOf(currentTurnFid);
    const nextIdx = (currentIdx + 1) % orderInRemaining.length;
    const nextFid = orderInRemaining[nextIdx];

    // Get next sequence number
    const existingActions = await pokerDb.fetch<{ sequence: number }>("kill_or_keep_actions", {
      filters: { game_id: gameId },
      select: "sequence",
      limit: 10000,
    });
    const maxSeq = (existingActions || []).length > 0 ? Math.max(...(existingActions || []).map((e) => Number(e.sequence))) : 0;
    const nextSeq = maxSeq + 1;

    const now = new Date().toISOString();
    const currentTurnEndsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await pokerDb.insert("kill_or_keep_actions", [
      { game_id: gameId, sequence: nextSeq, actor_fid: 0, action: "skip", target_fid: currentTurnFid, created_at: now },
    ]);

    await pokerDb.update("kill_or_keep_games", { id: gameId }, {
      current_turn_fid: nextFid,
      current_turn_ends_at: currentTurnEndsAt,
      updated_at: now,
    });

    if (game.is_preview !== true) {
      const notificationId = `kill_or_keep_turn:${gameId}:${nextFid}`.slice(0, 128);
      sendNotificationToFid(
        nextFid,
        {
          title: "KILL OR KEEP",
          body: "It's your turn — Keep or Kill one player.",
          targetUrl: `${APP_URL}/kill-or-keep?gameId=${gameId}`,
        },
        notificationId
      ).catch((err) => console.error("[kill-or-keep/skip] push failed:", err));
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { skippedFid: currentTurnFid, nextTurnFid: nextFid },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/skip POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to skip player" }, { status: 500 });
  }
}
