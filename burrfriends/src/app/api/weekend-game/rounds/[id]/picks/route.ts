/**
 * GET /api/weekend-game/rounds/[id]/picks
 * Auth: admin or one of 5 winners for that round. List 5 winners and their pick_1_fid, pick_2_fid (and names).
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

    const roundRows = await pokerDb.fetch<{ id: string; round_label: string | null; status: string; picks_locked_at?: string | null }>("weekend_game_rounds", {
      filters: { id: roundId },
      limit: 1,
    });
    if (!roundRows || roundRows.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found." }, { status: 404 });
    }
    const round = roundRows[0];
    const roundLabel = round.round_label;

    if (roundLabel == null || roundLabel === "") {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { roundId, roundLabel, roundStatus: round.status, picksLockedAt: round.picks_locked_at ?? null, winners: [] },
      });
    }
    const settlements = await pokerDb.fetch<{ winner_fid: number; position: number }>("weekend_game_settlements", {
      filters: { round_label: roundLabel },
      select: "winner_fid,position",
      order: "position.asc",
      limit: 10,
    });
    if (!settlements || settlements.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { roundId, roundLabel, roundStatus: round.status, picksLockedAt: round.picks_locked_at ?? null, winners: [] },
      });
    }

    const winnerFids = new Set((settlements || []).map((s) => s.winner_fid));
    if (!isAdmin(fid) && !winnerFids.has(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin or a winner for this round can view picks." }, { status: 403 });
    }

    const picksRows = await pokerDb.fetch<{ winner_fid: number; pick_1_fid: number | null; pick_2_fid: number | null; submitted_at: string }>(
      "weekend_game_winner_picks",
      { filters: { round_id: roundId }, limit: 10 }
    );
    const picksByWinner = new Map<number, { pick_1_fid: number | null; pick_2_fid: number | null; submitted_at: string }>();
    for (const p of picksRows || []) {
      picksByWinner.set(p.winner_fid, {
        pick_1_fid: p.pick_1_fid ?? null,
        pick_2_fid: p.pick_2_fid ?? null,
        submitted_at: p.submitted_at,
      });
    }

    const allFids = new Set<number>(winnerFids);
    for (const p of picksRows || []) {
      if (p.pick_1_fid) allFids.add(p.pick_1_fid);
      if (p.pick_2_fid) allFids.add(p.pick_2_fid);
    }
    const userMap: Record<number, { username?: string; display_name?: string }> = {};
    if (allFids.size > 0) {
      try {
        const client = getNeynarClient();
        const { users } = await client.fetchBulkUsers({ fids: Array.from(allFids) });
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
        console.warn("[weekend-game/rounds/[id]/picks] fetchBulkUsers failed:", e);
      }
    }

    const winners = (settlements || []).map((s) => ({
      winner_fid: s.winner_fid,
      position: s.position,
      username: userMap[s.winner_fid]?.username ?? null,
      display_name: userMap[s.winner_fid]?.display_name ?? null,
      pick_1_fid: picksByWinner.get(s.winner_fid)?.pick_1_fid ?? null,
      pick_2_fid: picksByWinner.get(s.winner_fid)?.pick_2_fid ?? null,
      submitted_at: picksByWinner.get(s.winner_fid)?.submitted_at ?? null,
      pick_1_username: userMap[picksByWinner.get(s.winner_fid)?.pick_1_fid ?? 0]?.username ?? null,
      pick_2_username: userMap[picksByWinner.get(s.winner_fid)?.pick_2_fid ?? 0]?.username ?? null,
    }));

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        roundId,
        roundLabel,
        roundStatus: round.status,
        picksLockedAt: round.picks_locked_at ?? null,
        winners,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/rounds/[id]/picks GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get picks" }, { status: 500 });
  }
}
