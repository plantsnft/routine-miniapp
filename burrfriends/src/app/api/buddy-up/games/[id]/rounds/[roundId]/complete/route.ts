/**
 * POST /api/buddy-up/games/[id]/rounds/[roundId]/complete - Complete round (admin only)
 * Checks all groups, determines winners/eliminations, updates group statuses
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roundId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId, roundId } = await params;
    const body = await req.json().catch(() => ({}));
    const advanceInSeconds = typeof body.advanceInSeconds === "number" ? body.advanceInSeconds : null;
    const allowedDelays = [60, 120, 180, 300];

    // Check round exists
    const rounds = await pokerDb.fetch<{ id: string; game_id: string; status: string }>("buddy_up_rounds", {
      filters: { id: roundId },
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }

    const round = rounds[0];
    if (round.game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round does not belong to this game" }, { status: 400 });
    }

    // Get all groups for this round
    const groups = await pokerDb.fetch<{
      id: string;
      group_number: number;
      fids: number[];
      status: string;
    }>("buddy_up_groups", {
      filters: { round_id: roundId },
      limit: 100,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No groups found for this round" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const winners: Array<{ groupId: string; winnerFid: number }> = [];
    const eliminated: string[] = [];

    // Process each group
    for (const group of groups) {
      if (group.status !== "voting") {
        continue; // Skip already processed groups
      }

      const groupFids = (group.fids || []).map((f) => Number(f));
      const groupSize = groupFids.length;

      // Get all votes for this group
      const votes = await pokerDb.fetch<{ voter_fid: number; voted_for_fid: number }>("buddy_up_votes", {
        filters: { group_id: group.id },
        limit: 100,
      });

      const voteCount = (votes || []).length;

      // Check if all members voted
      if (voteCount < groupSize) {
        // Not all voted - eliminate
        await pokerDb.update("buddy_up_groups", { id: group.id }, { status: "eliminated", updated_at: now });
        eliminated.push(group.id);
        continue;
      }

      // All voted - check if all votes are the same
      const voteTargets = (votes || []).map((v) => Number(v.voted_for_fid));
      const firstVote = voteTargets[0];
      const allSame = voteTargets.every((v) => v === firstVote);

      if (!allSame) {
        // Disagreement - eliminate
        await pokerDb.update("buddy_up_groups", { id: group.id }, { status: "eliminated", updated_at: now });
        eliminated.push(group.id);
        continue;
      }

      // All voted and all agree - winner!
      const winnerFid = firstVote;
      await pokerDb.update("buddy_up_groups", { id: group.id }, { status: "completed", winner_fid: winnerFid, updated_at: now });
      winners.push({ groupId: group.id, winnerFid });
    }

    // Update round status to completed
    await pokerDb.update("buddy_up_rounds", { id: roundId }, { status: "completed", updated_at: now });

    // Increment game's current_round for next round
    const game = await pokerDb.fetch<{ current_round: number }>("buddy_up_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (game && game.length > 0) {
      const patch: Record<string, unknown> = { current_round: game[0].current_round + 1, updated_at: now };
      if (advanceInSeconds != null && allowedDelays.includes(advanceInSeconds)) {
        const at = new Date(Date.now() + advanceInSeconds * 1000).toISOString();
        patch.advance_at = at;
      } else {
        patch.advance_at = null;
      }
      await pokerDb.update("buddy_up_games", { id: gameId }, patch);
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Round completed",
      data: {
        winners,
        eliminated: eliminated.length,
        totalGroups: groups.length,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/rounds/[roundId]/complete POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to complete round" }, { status: 500 });
  }
}
