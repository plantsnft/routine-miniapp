/**
 * GET /api/weekend-game/rounds/[id]/pick-pool
 * Auth: admin or one of 5 winners for that round.
 * Returns FIDs (and names) still available to be picked: alive minus 5 winners minus any already chosen.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);

    const { id: roundId } = await params;

    const roundRows = await pokerDb.fetch<{ id: string; round_label: string | null }>("weekend_game_rounds", {
      filters: { id: roundId },
      limit: 1,
    });
    if (!roundRows || roundRows.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found." }, { status: 404 });
    }
    const roundLabel = roundRows[0].round_label;

    if (roundLabel == null || roundLabel === "") {
      return NextResponse.json<ApiResponse>({ ok: true, data: { roundId, pool: [] } });
    }

    const settlements = await pokerDb.fetch<{ winner_fid: number }>("weekend_game_settlements", {
      filters: { round_label: roundLabel },
      select: "winner_fid",
      limit: 10,
    });
    const winnerFids = new Set((settlements || []).map((s) => s.winner_fid));

    if (!isAdmin(fid) && !winnerFids.has(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin or a winner for this round can view the pick pool." }, { status: 403 });
    }

    const [aliveRows, picksRows] = await Promise.all([
      pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        filters: { status: "alive" },
        select: "fid",
        limit: 500,
      }),
      pokerDb.fetch<{ pick_1_fid: number | null; pick_2_fid: number | null }>("weekend_game_winner_picks", {
        filters: { round_id: roundId },
        select: "pick_1_fid,pick_2_fid",
        limit: 10,
      }),
    ]);

    const pickedFids = new Set<number>();
    for (const p of picksRows || []) {
      if (p.pick_1_fid != null) pickedFids.add(p.pick_1_fid);
      if (p.pick_2_fid != null) pickedFids.add(p.pick_2_fid);
    }

    const poolFids: number[] = [];
    for (const r of aliveRows || []) {
      const f = Number(r.fid);
      if (winnerFids.has(f) || pickedFids.has(f)) continue;
      poolFids.push(f);
    }

    const userMap: Record<number, { username?: string; display_name?: string }> = {};
    if (poolFids.length > 0) {
      try {
        const client = getNeynarClient();
        const { users } = await client.fetchBulkUsers({ fids: poolFids });
        for (const u of users || []) {
          const id = (u as { fid?: number }).fid;
          if (id != null) {
            userMap[id] = {
              username: (u as { username?: string }).username,
              display_name: (u as { display_name?: string }).display_name,
            };
          }
        }
      } catch (e) {
        console.warn("[weekend-game/rounds/[id]/pick-pool] fetchBulkUsers failed:", e);
      }
    }

    const pool = poolFids.map((f) => ({
      fid: f,
      username: userMap[f]?.username ?? null,
      display_name: userMap[f]?.display_name ?? null,
    }));

    return NextResponse.json<ApiResponse>({ ok: true, data: { roundId, pool } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/rounds/[id]/pick-pool GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get pick pool" }, { status: 500 });
  }
}
