/**
 * POST /api/bullied/games/[id]/vote/reason - Submit or update vote reason (THE BETR CONFESSIONALS)
 * Body: { roundId: string, groupId: string, reason: string } (reason max 10,000 chars; empty/whitespace stored as NULL)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const body = await req.json().catch(() => ({}));
    const roundId = typeof body.roundId === "string" ? body.roundId.trim() : null;
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : null;
    const reason = typeof body.reason === "string" ? body.reason : "";

    if (!roundId || !groupId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "roundId and groupId are required" }, { status: 400 });
    }

    if (reason.length > 10000) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Reason must be at most 10,000 characters" }, { status: 400 });
    }

    const value = reason.trim();
    // Store empty/whitespace as NULL
    const reasonText = value === "" ? null : value;

    // Check game exists and is in_progress
    const games = await pokerDb.fetch<{ id: string; status: string }>("bullied_games", {
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

    // Check round exists and is in voting status
    const rounds = await pokerDb.fetch<{ id: string; status: string }>("bullied_rounds", {
      filters: { id: roundId, game_id: gameId },
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }

    const round = rounds[0];
    if (round.status !== "voting") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round is not in voting phase" }, { status: 400 });
    }

    // Check group exists and user is in it
    const groups = await pokerDb.fetch<{ id: string; fids: number[]; status: string }>("bullied_groups", {
      filters: { id: groupId, round_id: roundId },
      limit: 1,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const group = groups[0];
    const groupFids = (group.fids || []).map((f) => Number(f));

    if (!groupFids.includes(Number(fid))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You are not in this group" }, { status: 403 });
    }

    // Vote must already exist (user must have voted)
    const existing = await pokerDb.fetch<{ id: string }>("bullied_votes", {
      filters: { group_id: groupId, voter_fid: fid },
      limit: 1,
    });

    if (!existing || existing.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Vote not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    await pokerDb.update(
      "bullied_votes",
      { group_id: groupId, voter_fid: fid },
      { reason_text: reasonText, updated_at: now }
    );

    return NextResponse.json<ApiResponse>({ ok: true, data: {} });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[bullied/games/[id]/vote/reason POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to save reason" }, { status: 500 });
  }
}
