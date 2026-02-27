/**
 * POST /api/weekend-game/settle
 * Admin only. Body: { roundId?, winners: [ {fid, amount, position} ], notes? }. Exactly 5 winners. Amounts 0 (advantage only).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const winners: Array<{ fid?: number; amount?: number; position?: number }> = Array.isArray(body.winners)
      ? body.winners
      : [];
    const roundId = typeof body.roundId === "string" ? body.roundId.trim() || null : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    let targetRound: { id: string; round_label?: string | null } | null = null;
    if (roundId) {
      const rounds = await pokerDb.fetch<{ id: string; status: string; round_label?: string | null }>(
        "weekend_game_rounds",
        { filters: { id: roundId }, limit: 1 }
      );
      if (!rounds || rounds.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
      }
      if (rounds[0].status === "settled") {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Round already settled" }, { status: 400 });
      }
      targetRound = rounds[0];
    } else {
      const [openRounds, closedRounds] = await Promise.all([
        pokerDb.fetch<{ id: string; round_label?: string | null; created_at: string }>("weekend_game_rounds", {
          filters: { status: "open" },
          order: "created_at.desc",
          limit: 1,
        }),
        pokerDb.fetch<{ id: string; round_label?: string | null; created_at: string }>("weekend_game_rounds", {
          filters: { status: "closed" },
          order: "created_at.desc",
          limit: 1,
        }),
      ]);
      const candidates = [...(openRounds || []), ...(closedRounds || [])];
      if (candidates.length > 0) {
        candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        targetRound = candidates[0];
      }
    }

    if (!targetRound) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No round to settle" }, { status: 400 });
    }

    if (winners.length !== 5) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Exactly 5 winners required." }, { status: 400 });
    }

    const [scores, regs] = await Promise.all([
      pokerDb.fetch<{ fid: number }>("weekend_game_scores", { select: "fid", limit: 1000 }),
      pokerDb.fetch<{ fid: number }>("betr_games_registrations", { select: "fid", limit: 10000 }),
    ]);
    const registeredSet = new Set((regs || []).map((r: { fid: number }) => Number(r.fid)));
    const submittersSet = new Set(
      (scores || []).filter((s: { fid: number }) => registeredSet.has(Number(s.fid))).map((s: { fid: number }) => Number(s.fid))
    );

    const winnerFids = winners.map((w) => Number(w?.fid)).filter((f) => f && !isNaN(f));
    if (winnerFids.length !== 5) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Five valid winner FIDs required." }, { status: 400 });
    }

    for (const w of winners) {
      const winnerFid = Number(w?.fid);
      if (!submittersSet.has(winnerFid)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Winner FID ${winnerFid} must have at least one verified score.` },
          { status: 400 }
        );
      }
    }

    const chosenAt = new Date().toISOString();
    const effectiveRoundLabel = targetRound.round_label || null;

    for (let i = 0; i < winners.length; i++) {
      const w = winners[i];
      await pokerDb.insert("weekend_game_settlements", [
        {
          round_label: effectiveRoundLabel,
          winner_fid: Number(w?.fid),
          amount: 0,
          position: Number(w?.position) ?? i + 1,
          chosen_by_fid: fid,
          chosen_at: chosenAt,
          tx_hash: null,
          notes,
        },
      ]);
    }

    await pokerDb.update("weekend_game_rounds", { id: targetRound.id }, {
      status: "settled",
      settled_at: chosenAt,
      settle_tx_hashes: [],
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { message: "Settled.", roundId: targetRound.id, roundLabel: effectiveRoundLabel },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/settle]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle" }, { status: 500 });
  }
}
