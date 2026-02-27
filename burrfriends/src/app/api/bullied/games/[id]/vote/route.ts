/**
 * POST /api/bullied/games/[id]/vote - Submit, change, or clear vote
 * Body: { roundId: string, groupId: string, votedForFid: number | null }
 * votedForFid number: insert or update vote (clears reason_text on change).
 * votedForFid null: clear vote (delete row); user can vote again.
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
    const votedForFidRaw = body.votedForFid;
    const isClear = votedForFidRaw === null;
    const votedForFid = typeof votedForFidRaw === "number" ? votedForFidRaw : parseInt(String(votedForFidRaw || ""), 10);

    if (!roundId || !groupId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "roundId and groupId are required" }, { status: 400 });
    }
    if (!isClear && isNaN(votedForFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "votedForFid is required (number or null to clear)" }, { status: 400 });
    }

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

    if (group.status !== "voting") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group is not in voting phase" }, { status: 400 });
    }

    // Clear vote: delete row and return (idempotent if no row)
    if (isClear) {
      await pokerDb.delete("bullied_votes", { group_id: groupId, voter_fid: fid });
      return NextResponse.json<ApiResponse>({
        ok: true,
        message: "Vote cleared",
        data: { votedForFid: null },
      });
    }

    // Validate votedForFid is in the same group
    if (!groupFids.includes(votedForFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You can only vote for someone in your group" }, { status: 400 });
    }

    // Check if already voted
    const existing = await pokerDb.fetch<{ id: string; voted_for_fid: number }>("bullied_votes", {
      filters: { group_id: groupId, voter_fid: fid },
      limit: 1,
    });

    const now = new Date().toISOString();

    if (existing && existing.length > 0) {
      // Update existing vote (changeable until round ends)
      await pokerDb.update("bullied_votes", { group_id: groupId, voter_fid: fid }, {
        voted_for_fid: votedForFid,
        reason_text: null,
        updated_at: now,
      });

      return NextResponse.json<ApiResponse>({
        ok: true,
        message: "Vote updated",
        data: { votedForFid },
      });
    }

    // Insert new vote
    await pokerDb.insert("bullied_votes", [
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
      return NextResponse.json<ApiResponse>({ ok: false, error: "Vote conflict, please try again" }, { status: 409 });
    }
    console.error("[bullied/games/[id]/vote POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit vote" }, { status: 500 });
  }
}
