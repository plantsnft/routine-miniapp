/**
 * POST /api/take-from-the-pile/games/[id]/skip - Skip current player (admin only)
 * Move current to back of queue; insert skip event; set new deadline; send push to new current. Phase 37.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { APP_URL } from "~/lib/constants";
import { sendNotificationToFid } from "~/lib/notifications";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      is_preview?: boolean;
      turn_order_fids: number[];
      pick_deadline_minutes: number;
      current_turn_ends_at: string | null;
    }>("take_from_the_pile_games", {
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

    const turnOrderFids = (game.turn_order_fids || []) as number[];
    if (turnOrderFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No one in turn order" }, { status: 400 });
    }

    const currentFid = Number(turnOrderFids[0]);
    const existingEvents = await pokerDb.fetch<{ sequence: number }>("take_from_the_pile_events", {
      filters: { game_id: gameId },
      select: "sequence",
      limit: 10000,
    });
    const maxSeq = (existingEvents || []).length > 0
      ? Math.max(...(existingEvents || []).map((e) => Number(e.sequence)))
      : 0;
    const nextSeq = maxSeq + 1;

    await pokerDb.insert("take_from_the_pile_events", [
      { game_id: gameId, sequence: nextSeq, fid: currentFid, event_type: "skip", amount_taken: null },
    ]);

    const newQueue = [...turnOrderFids.slice(1), currentFid];
    const deadlineMinutes = game.pick_deadline_minutes ?? 60;
    const newEndsAt = new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await pokerDb.update("take_from_the_pile_games", { id: gameId }, {
      turn_order_fids: newQueue,
      current_turn_ends_at: newEndsAt,
      updated_at: now,
    });

    const newCurrentFid = newQueue[0];
    if (game.is_preview !== true) {
      const targetUrl = `${APP_URL}/take-from-the-pile?gameId=${gameId}`;
      const notificationId = `take_from_the_pile_turn:${gameId}:${newCurrentFid}`.slice(0, 128);
      sendNotificationToFid(
        newCurrentFid,
        { title: "TAKE FROM THE PILE", body: "It's your turn to take from the pile.", targetUrl },
        notificationId
      ).catch((err) => console.error("[take-from-the-pile/skip] push failed:", err));
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { skippedFid: currentFid, newTurnFid: newCurrentFid },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[take-from-the-pile/games/[id]/skip POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to skip" }, { status: 500 });
  }
}
