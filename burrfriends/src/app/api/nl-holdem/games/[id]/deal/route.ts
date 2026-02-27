/**
 * POST /api/nl-holdem/games/[id]/deal - Create new hand (participant or admin).
 * Phase 40. No-op if active hand exists. Ensures stacks then calls dealHand.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { initPlayForGame, dealHand } from "~/lib/nlHoldemPlay";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const games = await pokerDb.fetch<{ id: string; status: string }>("nl_holdem_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    if (games[0].status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    const signups = await pokerDb.fetch<{ fid: number }>("nl_holdem_signups", {
      filters: { game_id: gameId, fid },
      limit: 1,
    });
    const isParticipant = signups?.length > 0;
    if (!isAdmin(fid) && !isParticipant) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Must be participant or admin" }, { status: 403 });
    }

    const stacks = await pokerDb.fetch<{ game_id: string }>("nl_holdem_stacks", {
      filters: { game_id: gameId },
      limit: 1,
    });
    if (!stacks?.length) {
      await initPlayForGame(gameId);
      await dealHand(gameId);
      return NextResponse.json<ApiResponse>({ ok: true, data: { gameId, dealt: true } });
    }

    const recentHands = await pokerDb.fetch<{ id: string; status: string }>("nl_holdem_hands", {
      filters: { game_id: gameId },
      order: "created_at.desc",
      limit: 1,
    });
    if (recentHands?.length && ["active", "showdown"].includes(recentHands[0].status)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Hand already in progress" }, { status: 400 });
    }

    await dealHand(gameId);
    return NextResponse.json<ApiResponse>({ ok: true, data: { gameId, dealt: true } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[nl-holdem/games/[id]/deal POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to deal" }, { status: 500 });
  }
}
