/**
 * POST /api/the-mole/games/[id]/rounds/[roundId]/complete - Complete round (admin only)
 * THE MOLE rules: all must agree AND be correct (voted_for_fid === mole_fid) to advance; else that group's mole wins the game.
 * If any group fails: game.status=mole_won, game.mole_winner_fid=that group's mole_fid; stop processing.
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

    const rounds = await pokerDb.fetch<{ id: string; game_id: string; status: string }>("mole_rounds", {
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

    const games = await pokerDb.fetch<{ id: string; status: string }>("mole_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    if (games[0].status === "mole_won") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game already ended (mole won)" }, { status: 400 });
    }

    const groups = await pokerDb.fetch<{
      id: string;
      group_number: number;
      fids: number[];
      mole_fid: number;
      status: string;
    }>("mole_groups", {
      filters: { round_id: roundId },
      limit: 100,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No groups found for this round" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const advanced: Array<{ groupId: string; fids: number[] }> = [];
    let moleWonGroup: { moleFid: number } | null = null;

    for (const group of groups) {
      if (group.status !== "voting") continue;

      const groupFids = (group.fids || []).map((f) => Number(f));
      const groupSize = groupFids.length;
      const moleFid = Number(group.mole_fid);

      const votes = await pokerDb.fetch<{ voter_fid: number; voted_for_fid: number }>("mole_votes", {
        filters: { group_id: group.id },
        limit: 100,
      });

      const voteCount = (votes || []).length;

      if (voteCount < groupSize) {
        await pokerDb.update("mole_groups", { id: group.id }, { status: "mole_won", updated_at: now });
        moleWonGroup = { moleFid };
        break;
      }

      const voteTargets = (votes || []).map((v) => Number(v.voted_for_fid));
      const first = voteTargets[0];
      const allSame = voteTargets.every((v) => v === first);

      if (!allSame) {
        await pokerDb.update("mole_groups", { id: group.id }, { status: "mole_won", updated_at: now });
        moleWonGroup = { moleFid };
        break;
      }

      if (first !== moleFid) {
        await pokerDb.update("mole_groups", { id: group.id }, { status: "mole_won", updated_at: now });
        moleWonGroup = { moleFid };
        break;
      }

      const nonMoles = groupFids.filter((f) => f !== moleFid);
      await pokerDb.update("mole_groups", { id: group.id }, { status: "completed", updated_at: now });
      advanced.push({ groupId: group.id, fids: nonMoles });
    }

    if (moleWonGroup != null) {
      await pokerDb.update("mole_games", { id: gameId }, {
        status: "mole_won",
        mole_winner_fid: moleWonGroup.moleFid,
        updated_at: now,
      });
      return NextResponse.json<ApiResponse>({
        ok: true,
        message: "The mole won the game.",
        data: { moleWon: true, moleFid: moleWonGroup.moleFid },
      });
    }

    await pokerDb.update("mole_rounds", { id: roundId }, { status: "completed", updated_at: now });

    const game = await pokerDb.fetch<{ current_round: number }>("mole_games", { filters: { id: gameId }, limit: 1 });
    if (game && game.length > 0) {
      await pokerDb.update("mole_games", { id: gameId }, { current_round: game[0].current_round + 1, updated_at: now });
    }

    const allAdvanced = advanced.flatMap((a) => a.fids);

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Round completed",
      data: {
        moleWon: false,
        advanced: allAdvanced,
        advancedCount: allAdvanced.length,
        totalGroups: groups.length,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[the-mole/games/[id]/rounds/[roundId]/complete POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to complete round" }, { status: 500 });
  }
}
