/**
 * POST /api/nl-holdem/games/[id]/hands/[handId]/reveal - Player voluntarily reveals hole cards after hand ends.
 * Phase 40. Requires player to be in the game; hand must be complete.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; handId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId, handId } = await params;

    const hands = await pokerDb.fetch<{ id: string; game_id: string; status: string }>("nl_holdem_hands", {
      filters: { id: handId, game_id: gameId },
      limit: 1,
    });
    if (!hands?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Hand not found" }, { status: 404 });
    }
    if (hands[0].status !== "complete") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Can only reveal cards after hand is complete" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{ seat_order_fids: number[] }>("nl_holdem_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    const seatOrderFids = (games[0].seat_order_fids ?? []).map(Number).filter((f) => f > 0);
    if (!seatOrderFids.includes(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You must be in the game to reveal your cards" }, { status: 403 });
    }

    const holeRows = await pokerDb.fetch<{ fid: number; cards: unknown }>("nl_holdem_hole_cards", {
      filters: { hand_id: handId, fid },
      limit: 1,
    });
    if (!holeRows?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No hole cards for this hand" }, { status: 400 });
    }
    const cards = Array.isArray(holeRows[0].cards) ? holeRows[0].cards : [];
    if (cards.length !== 2) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid hole cards" }, { status: 400 });
    }

    await pokerDb.upsert("nl_holdem_hand_revealed_cards", [{ hand_id: handId, fid, cards }]);

    return NextResponse.json<ApiResponse>({ ok: true });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[nl-holdem/games/[id]/hands/[handId]/reveal POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to reveal cards" }, { status: 500 });
  }
}
