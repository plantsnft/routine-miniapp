/**
 * POST /api/take-from-the-pile/games/[id]/pick - Take amount from the pile (current turn only)
 * Layer 3: isAdminPreviewBypass skips registration/alive/current-turn check.
 * Inserts pick + event; reduces pot; advances queue; sends push to new current. Phase 37.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import { APP_URL } from "~/lib/constants";
import { sendNotificationToFid } from "~/lib/notifications";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const body = await req.json().catch(() => ({}));
    const amount = typeof body.amount === "number" ? body.amount : NaN;
    if (isNaN(amount) || amount < 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "amount must be a non-negative number" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      is_preview?: boolean;
      current_pot_amount: number;
      turn_order_fids: number[];
      pick_deadline_minutes: number;
    }>("take_from_the_pile_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status === "settled" || game.status === "cancelled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is already ended" }, { status: 400 });
    }
    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Picks are only allowed when game is in progress" }, { status: 400 });
    }

    const turnOrderFids = (game.turn_order_fids || []) as number[];
    const currentTurnFid = turnOrderFids.length > 0 ? Number(turnOrderFids[0]) : null;
    const isCurrentTurn = currentTurnFid === fid;
    const adminBypass = canPlayPreviewGame(fid, game.is_preview, req);

    if (!isCurrentTurn) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "It is not your turn." }, { status: 403 });
    }
    if (!adminBypass) {
      const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
        filters: { fid, community: "betr" },
        limit: 1,
      });
      if (!registered || registered.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
      }
      const alive = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        filters: { fid, status: "alive", community: "betr" },
        limit: 1,
      });
      if (!alive || alive.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "You are not an eligible (alive) player for this game." }, { status: 403 });
      }
    }

    const currentPot = Number(game.current_pot_amount);
    if (amount > currentPot) {
      return NextResponse.json<ApiResponse>({ ok: false, error: `Amount cannot exceed current pot (${currentPot})` }, { status: 400 });
    }

    const now = new Date().toISOString();

    const existingEvents = await pokerDb.fetch<{ sequence: number }>("take_from_the_pile_events", {
      filters: { game_id: gameId },
      select: "sequence",
      limit: 10000,
    });
    const maxSeq = (existingEvents || []).length > 0
      ? Math.max(...(existingEvents || []).map((e) => Number(e.sequence)))
      : 0;
    const nextSeq = maxSeq + 1;

    await pokerDb.insert("take_from_the_pile_picks", [
      { game_id: gameId, fid: Number(fid), amount_taken: amount, taken_at: now },
    ]);
    await pokerDb.insert("take_from_the_pile_events", [
      { game_id: gameId, sequence: nextSeq, fid: Number(fid), event_type: "pick", amount_taken: amount },
    ]);

    let newPot = currentPot - amount;
    let newQueue = turnOrderFids.slice(1);
    let drainSeq = nextSeq;

    // Drain: apply preloads for next players while pot >= preload
    while (newQueue.length > 0) {
      const headFid = Number(newQueue[0]);
      const preloadRows = await pokerDb.fetch<{ preload_amount: number }>("take_from_the_pile_preloads", {
        filters: { game_id: gameId, fid: headFid },
        limit: 1,
      });
      if (!preloadRows || preloadRows.length === 0) break;
      const preloadAmount = Number(preloadRows[0].preload_amount);
      if (preloadAmount > newPot) break;

      const drainNow = new Date().toISOString();
      await pokerDb.insert("take_from_the_pile_picks", [
        { game_id: gameId, fid: headFid, amount_taken: preloadAmount, taken_at: drainNow },
      ]);
      drainSeq += 1;
      await pokerDb.insert("take_from_the_pile_events", [
        { game_id: gameId, sequence: drainSeq, fid: headFid, event_type: "pick", amount_taken: preloadAmount },
      ]);
      newPot -= preloadAmount;
      await pokerDb.delete("take_from_the_pile_preloads", { game_id: gameId, fid: headFid });
      newQueue = newQueue.slice(1);
    }

    const deadlineMinutes = game.pick_deadline_minutes ?? 60;
    const newEndsAt = newQueue.length > 0
      ? new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString()
      : null;

    await pokerDb.update("take_from_the_pile_games", { id: gameId }, {
      current_pot_amount: newPot,
      turn_order_fids: newQueue,
      current_turn_ends_at: newEndsAt,
      updated_at: now,
    });

    if (newQueue.length > 0 && game.is_preview !== true) {
      const newCurrentFid = Number(newQueue[0]);
      const targetUrl = `${APP_URL}/take-from-the-pile?gameId=${gameId}`;
      const notificationId = `take_from_the_pile_turn:${gameId}:${newCurrentFid}`.slice(0, 128);
      sendNotificationToFid(
        newCurrentFid,
        {
          title: "TAKE FROM THE PILE",
          body: "It's your turn to take from the pile.",
          targetUrl,
        },
        notificationId
      ).catch((err) => console.error("[take-from-the-pile/pick] push failed:", err));
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { amount, newPot, nextTurnFid: newQueue.length > 0 ? newQueue[0] : null },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("Register for BETR GAMES")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("[take-from-the-pile/games/[id]/pick POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit pick" }, { status: 500 });
  }
}
