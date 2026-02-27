/**
 * POST /api/kill-or-keep/games/[id]/action - Submit keep or kill (current turn only, or admin preview bypass)
 * Phase 38. Round complete when (actorIndex+1) % orderInRemaining.length === 0; settle when round complete and remaining <= 10.
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
    const action = body.action === "kill" ? "kill" : body.action === "keep" ? "keep" : null;
    const targetFid = typeof body.targetFid === "number" ? body.targetFid : Number(body.targetFid);
    if (!action || !Number.isFinite(targetFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "action must be 'keep' or 'kill' and targetFid must be a number" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      is_preview?: boolean;
      turn_order_fids: number[];
      remaining_fids: number[];
      eliminated_fids: number[];
      current_turn_fid: number | null;
      safe_fids: number[];
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
    const isCurrentTurn = currentTurnFid === fid;
    const adminBypass = canPlayPreviewGame(fid, game.is_preview, req);
    if (!isCurrentTurn && !adminBypass) {
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

    const remainingFids = (game.remaining_fids || []).map((f: unknown) => Number(f)) as number[];
    if (!remainingFids.includes(targetFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Target is not in the remaining players list" }, { status: 400 });
    }
    if (targetFid === fid) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You cannot keep or kill yourself" }, { status: 400 });
    }

    const safeFidsList = (game.safe_fids || []).map((f: unknown) => Number(f)) as number[];

    if (action === "kill" && safeFidsList.includes(targetFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "This player is Safe and cannot be eliminated." }, { status: 400 });
    }

    const turnOrderFids = (game.turn_order_fids || []).map((f: unknown) => Number(f)) as number[];
    let newRemaining = [...remainingFids];
    const newEliminated = [...(game.eliminated_fids || []).map((f: unknown) => Number(f))];

    if (action === "kill") {
      newRemaining = newRemaining.filter((f) => f !== targetFid);
      newEliminated.push(targetFid);
    }

    const existingActions = await pokerDb.fetch<{ sequence: number }>("kill_or_keep_actions", {
      filters: { game_id: gameId },
      select: "sequence",
      limit: 10000,
    });
    const maxSeq = (existingActions || []).length > 0 ? Math.max(...(existingActions || []).map((e) => Number(e.sequence))) : 0;
    const nextSeq = maxSeq + 1;

    const now = new Date().toISOString();
    await pokerDb.insert("kill_or_keep_actions", [
      { game_id: gameId, sequence: nextSeq, actor_fid: Number(fid), action, target_fid: targetFid, created_at: now },
    ]);

    const orderInRemaining = turnOrderFids.filter((f) => newRemaining.includes(f));
    const actorIndex = orderInRemaining.indexOf(fid);
    if (actorIndex === -1) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Current player not in remaining list" }, { status: 500 });
    }
    const nextIndex = (actorIndex + 1) % orderInRemaining.length;
    const nextFid = orderInRemaining[nextIndex];
    const roundComplete = nextIndex === 0;
    const shouldSettle = roundComplete && newRemaining.length <= 10;

    const newSafeFids = action === "keep" && !safeFidsList.includes(targetFid)
      ? [...safeFidsList, targetFid]
      : safeFidsList;

    const updatePayload: Record<string, unknown> = {
      remaining_fids: newRemaining,
      eliminated_fids: newEliminated,
      safe_fids: newSafeFids,
      updated_at: now,
    };
    if (shouldSettle) {
      updatePayload.status = "settled";
      updatePayload.current_turn_fid = null;
      updatePayload.current_turn_ends_at = null;
    } else {
      updatePayload.current_turn_fid = nextFid;
      updatePayload.current_turn_ends_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }

    await pokerDb.update("kill_or_keep_games", { id: gameId }, updatePayload);

    if (!game.is_preview && !shouldSettle && nextFid != null) {
      const notificationId = `kill_or_keep_turn:${gameId}:${nextFid}`.slice(0, 128);
      sendNotificationToFid(
        nextFid,
        {
          title: "KILL OR KEEP",
          body: "It's your turn — Keep or Kill one player.",
          targetUrl: `${APP_URL}/kill-or-keep?gameId=${gameId}`,
        },
        notificationId
      ).catch((err) => console.error("[kill-or-keep/action] push failed:", err));
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        action,
        targetFid,
        nextTurnFid: shouldSettle ? null : nextFid,
        roundComplete,
        settled: shouldSettle,
        remainingCount: newRemaining.length,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("Register for BETR GAMES")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("[kill-or-keep/games/[id]/action POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit action" }, { status: 500 });
  }
}
