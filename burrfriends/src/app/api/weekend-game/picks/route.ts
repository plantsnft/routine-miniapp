/**
 * POST /api/weekend-game/picks
 * Body: roundId, pick1Fid, pick2Fid (each optional; null or omit = clear that slot). Caller must be one of 5 winners.
 * Chosen FID must be in current pick pool. Picks are editable until round is locked (picks_locked_at set or status settled); once locked, 400 for change/clear.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

type RoundRow = { id: string; round_label: string | null; status: string; picks_locked_at?: string | null };
type PickRow = { winner_fid: number; pick_1_fid: number | null; pick_2_fid: number | null };

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const roundId = typeof body.roundId === "string" ? body.roundId.trim() : null;
    const raw1 = body.pick1Fid;
    const raw2 = body.pick2Fid;
    const pick1Fid = typeof raw1 === "number" ? raw1 : parseInt(String(raw1 ?? ""), 10);
    const pick2Fid = typeof raw2 === "number" ? raw2 : parseInt(String(raw2 ?? ""), 10);
    const has1 = Number.isInteger(pick1Fid) && pick1Fid > 0;
    const has2 = Number.isInteger(pick2Fid) && pick2Fid > 0;

    if (!roundId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "roundId is required." }, { status: 400 });
    }

    const roundRows = await pokerDb.fetch<RoundRow>("weekend_game_rounds", {
      filters: { id: roundId },
      limit: 1,
    });
    if (!roundRows || roundRows.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found." }, { status: 404 });
    }
    const round = roundRows[0];
    const roundLabel = round.round_label ?? "";
    if (roundLabel === "") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round has no label; cannot resolve winners." }, { status: 400 });
    }

    const settlementsForRound = await pokerDb.fetch<{ winner_fid: number }>("weekend_game_settlements", {
      filters: { round_label: roundLabel },
      select: "winner_fid",
      limit: 10,
    });
    const winnerSet = new Set((settlementsForRound || []).map((s) => s.winner_fid));

    if (!winnerSet.has(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only winners of this round can submit picks." },
        { status: 403 }
      );
    }

    const existingRows = await pokerDb.fetch<{ pick_1_fid: number | null; pick_2_fid: number | null }>(
      "weekend_game_winner_picks",
      { filters: { round_id: roundId, winner_fid: fid }, limit: 1 }
    );
    const existing = existingRows?.[0] ?? null;

    const isLocked =
      (round.picks_locked_at != null && round.picks_locked_at !== "") || round.status === "settled";
    if (isLocked) {
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Picks are locked; the game has ended." },
          { status: 400 }
        );
      }
      const wouldChange1 = existing.pick_1_fid != null && (!has1 || pick1Fid !== existing.pick_1_fid);
      const wouldChange2 = existing.pick_2_fid != null && (!has2 || pick2Fid !== existing.pick_2_fid);
      if (wouldChange1 || wouldChange2) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Picks are locked; the game has ended." },
          { status: 400 }
        );
      }
    }

    const [aliveRows, allPicksRows] = await Promise.all([
      pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        filters: { status: "alive" },
        select: "fid",
        limit: 500,
      }),
      pokerDb.fetch<PickRow>("weekend_game_winner_picks", {
        filters: { round_id: roundId },
        select: "winner_fid,pick_1_fid,pick_2_fid",
        limit: 10,
      }),
    ]);

    const pickedByOthers = new Set<number>();
    for (const p of allPicksRows || []) {
      if (p.winner_fid === fid) continue;
      if (p.pick_1_fid != null) pickedByOthers.add(p.pick_1_fid);
      if (p.pick_2_fid != null) pickedByOthers.add(p.pick_2_fid);
    }

    const poolForPick1 = new Set<number>();
    const poolForPick2 = new Set<number>();
    for (const r of aliveRows || []) {
      const f = Number(r.fid);
      if (winnerSet.has(f)) continue;
      if (pickedByOthers.has(f)) continue;
      poolForPick1.add(f);
      poolForPick2.add(f);
    }
    if (existing?.pick_2_fid != null) poolForPick1.delete(existing.pick_2_fid);
    if (existing?.pick_1_fid != null) poolForPick2.delete(existing.pick_1_fid);

    if (has1 && pick1Fid === fid) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You cannot pick yourself." }, { status: 400 });
    }
    if (has2 && pick2Fid === fid) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You cannot pick yourself." }, { status: 400 });
    }
    if (has1 && has2 && pick1Fid === pick2Fid) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Pick 1 and Pick 2 must be different." }, { status: 400 });
    }
    if (has1 && !poolForPick1.has(pick1Fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Pick 1 is not in the current pick pool." }, { status: 400 });
    }
    if (has2 && !poolForPick2.has(pick2Fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Pick 2 is not in the current pick pool." }, { status: 400 });
    }

    const newPick1 = isLocked ? (existing?.pick_1_fid ?? (has1 ? pick1Fid : null)) : (has1 ? pick1Fid : null);
    const newPick2 = isLocked ? (existing?.pick_2_fid ?? (has2 ? pick2Fid : null)) : (has2 ? pick2Fid : null);

    const now = new Date().toISOString();

    if (existing) {
      await pokerDb.update(
        "weekend_game_winner_picks",
        { round_id: roundId, winner_fid: fid },
        { pick_1_fid: newPick1, pick_2_fid: newPick2, submitted_at: now }
      );
    } else {
      await pokerDb.insert("weekend_game_winner_picks", [
        {
          round_id: roundId,
          winner_fid: fid,
          pick_1_fid: newPick1,
          pick_2_fid: newPick2,
          submitted_at: now,
        },
      ]);
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Picks saved." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/picks]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to save picks" }, { status: 500 });
  }
}
