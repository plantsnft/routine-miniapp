/**
 * POST /api/bullied/games/[id]/rounds/[roundId]/complete - Complete round and settle game (admin only)
 * Single round: completing the round also settles the game.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roundId: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId, roundId } = await params;

    // Check round exists and belongs to game
    const rounds = await pokerDb.fetch<{ id: string; game_id: string; status: string }>("bullied_rounds", {
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
    }>("bullied_groups", {
      filters: { round_id: roundId },
      limit: 100,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No groups found for this round" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const winners: Array<{ groupId: string; winnerFid: number }> = [];
    const eliminated: string[] = [];

    for (const group of groups) {
      if (group.status !== "voting") {
        // Already processed (e.g. 1-player auto-completed in start)
        if (group.status === "completed") {
          // Count existing winners
          const existingGroup = group as any;
          if (existingGroup.winner_fid) {
            winners.push({ groupId: group.id, winnerFid: Number(existingGroup.winner_fid) });
          }
        }
        continue;
      }

      const groupFids = (group.fids || []).map((f) => Number(f));
      const groupSize = groupFids.length;

      // Defensive: handle 1-member group that wasn't auto-completed
      if (groupSize === 1) {
        await pokerDb.update("bullied_groups", { id: group.id }, {
          status: "completed",
          winner_fid: groupFids[0],
          updated_at: now,
        });
        winners.push({ groupId: group.id, winnerFid: groupFids[0] });
        continue;
      }

      // Get all votes for this group
      const votes = await pokerDb.fetch<{ voter_fid: number; voted_for_fid: number }>("bullied_votes", {
        filters: { group_id: group.id },
        limit: 100,
      });

      const voteCount = (votes || []).length;

      // Not all voted - eliminate
      if (voteCount < groupSize) {
        await pokerDb.update("bullied_groups", { id: group.id }, { status: "eliminated", updated_at: now });
        eliminated.push(group.id);
        continue;
      }

      // All voted - check if unanimous
      const voteTargets = (votes || []).map((v) => Number(v.voted_for_fid));
      const firstVote = voteTargets[0];
      const allSame = voteTargets.every((v) => v === firstVote);

      if (!allSame) {
        // Disagreement - eliminate
        await pokerDb.update("bullied_groups", { id: group.id }, { status: "eliminated", updated_at: now });
        eliminated.push(group.id);
        continue;
      }

      // Unanimous - winner
      const winnerFid = firstVote;
      await pokerDb.update("bullied_groups", { id: group.id }, {
        status: "completed",
        winner_fid: winnerFid,
        updated_at: now,
      });
      winners.push({ groupId: group.id, winnerFid });
    }

    // Update round status to completed
    await pokerDb.update("bullied_rounds", { id: roundId }, { status: "completed", updated_at: now });

    // Single round game: set game to settled
    await pokerDb.update("bullied_games", { id: gameId }, { status: "settled", updated_at: now });

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Round completed and game settled",
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
    console.error("[bullied/games/[id]/rounds/[roundId]/complete POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to complete round" }, { status: 500 });
  }
}
