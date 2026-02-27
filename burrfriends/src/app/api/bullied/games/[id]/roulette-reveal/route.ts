/**
 * POST /api/bullied/games/[id]/roulette-reveal - Reveal the roulette winner for a locked group
 *
 * Body: { roundId: string, groupId: string }
 *
 * Group must be in 'voting' status and roulette_locked_at must be set.
 * Server picks one of the group FIDs at random using crypto.randomInt (Node built-in).
 * Sets winner_fid and status = 'completed' on the group.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";
import { randomInt } from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const body = await req.json();
    const { roundId, groupId } = body as { roundId: string; groupId: string };

    if (!roundId || !groupId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "roundId and groupId are required" }, { status: 400 });
    }

    // Fetch game to confirm in_progress and roulette deployed
    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      roulette_wheel_deployed_at: string | null;
    }>("bullied_games", {
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

    if (!game.roulette_wheel_deployed_at) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Roulette Wheel has not been deployed for this game" }, { status: 400 });
    }

    // Fetch group
    const groups = await pokerDb.fetch<{
      id: string;
      round_id: string;
      fids: number[];
      status: string;
      roulette_locked_at: string | null;
      winner_fid: number | null;
    }>("bullied_groups", {
      filters: { id: groupId },
      limit: 1,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const group = groups[0];

    if (group.round_id !== roundId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group does not belong to this round" }, { status: 400 });
    }

    // Verify caller is in group
    const groupFids = (group.fids || []).map((f) => Number(f));
    if (!groupFids.includes(Number(fid))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You are not in this group" }, { status: 403 });
    }

    // Group must be in voting status
    if (group.status !== "voting") {
      // If already completed (e.g. double-tap), return existing winner
      if (group.status === "completed" && group.winner_fid) {
        return NextResponse.json<ApiResponse>({ ok: true, data: { winnerFid: Number(group.winner_fid) } });
      }
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group is no longer in voting status" }, { status: 400 });
    }

    // Must be locked before reveal
    if (!group.roulette_locked_at) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Roulette is not locked yet — all 3 players must choose the wheel first" }, { status: 400 });
    }

    // Pick one FID at random — server-side only, crypto.randomInt for fairness
    const idx = randomInt(0, groupFids.length);
    const winnerFid = groupFids[idx];

    const now = new Date().toISOString();
    await pokerDb.update("bullied_groups", { id: groupId }, {
      winner_fid: winnerFid,
      status: "completed",
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: { winnerFid } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[bullied/games/[id]/roulette-reveal POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to reveal roulette winner" }, { status: 500 });
  }
}
