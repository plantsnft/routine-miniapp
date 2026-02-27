/**
 * POST /api/buddy-up/games/[id]/vote - Submit vote
 * Body: { roundId: string, groupId: string, votedForFid: number }
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
    const votedForFid = typeof body.votedForFid === "number" ? body.votedForFid : parseInt(String(body.votedForFid || ""), 10);

    if (!roundId || !groupId || isNaN(votedForFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "roundId, groupId, and votedForFid are required" }, { status: 400 });
    }

    // Check game exists and is in_progress
    const games = await pokerDb.fetch<{ id: string; status: string }>("buddy_up_games", {
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
    const rounds = await pokerDb.fetch<{ id: string; status: string }>("buddy_up_rounds", {
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
    const groups = await pokerDb.fetch<{ id: string; fids: number[]; status: string }>("buddy_up_groups", {
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

    if (group.status !== "voting") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group is not in voting phase" }, { status: 400 });
    }

    // Validate votedForFid is in the same group
    if (!groupFids.includes(votedForFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You can only vote for someone in your group" }, { status: 400 });
    }

    // Check if already voted (UNIQUE constraint will also enforce this)
    const existing = await pokerDb.fetch<{ id: string }>("buddy_up_votes", {
      filters: { group_id: groupId, voter_fid: fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already voted" }, { status: 400 });
    }

    // Insert vote
    const now = new Date().toISOString();
    await pokerDb.insert("buddy_up_votes", [
      {
        group_id: groupId,
        voter_fid: fid,
        voted_for_fid: votedForFid,
        submitted_at: now,
        updated_at: now,
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Vote submitted",
      data: { votedForFid },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("UNIQUE")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already voted" }, { status: 400 });
    }
    console.error("[buddy-up/games/[id]/vote POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit vote" }, { status: 500 });
  }
}
