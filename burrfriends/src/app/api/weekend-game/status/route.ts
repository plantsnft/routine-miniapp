/**
 * GET /api/weekend-game/status
 * Auth required. Returns: registered, approved, canSubmit, registrationClosed, myBestScore, myRank.
 * canSubmit = true only when user passes all eligibility checks (Phase 30).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const adminBypass = isGlobalAdmin(fid);

    const [regs, scores, tournamentRows, aliveRows] = await Promise.all([
      pokerDb.fetch<{ fid: number; approved_at: string | null; rejected_at: string | null }>(
        "betr_games_registrations",
        { filters: { fid }, select: "fid,approved_at,rejected_at", limit: 1 }
      ),
      pokerDb.fetch<{ fid: number; best_score: number }>("weekend_game_scores", { filters: { fid }, limit: 1 }),
      pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", { select: "fid", limit: 1 }),
      pokerDb.fetch<{ fid: number; status: string }>("betr_games_tournament_players", {
        filters: { fid },
        select: "fid,status",
        limit: 1,
      }),
    ]);

    const registered = !!(regs && regs.length > 0) || adminBypass;
    const approved = (registered && !!regs?.[0]?.approved_at && !regs?.[0]?.rejected_at) || adminBypass;
    const registrationClosed = !adminBypass && Boolean(tournamentRows && tournamentRows.length > 0);
    const tournamentStarted = registrationClosed;
    const isAlive = !tournamentStarted || (aliveRows && aliveRows.length > 0 && aliveRows[0].status === "alive") || adminBypass;
    const canSubmit = registered && approved && isAlive;
    const rejected = !adminBypass && !!(regs && regs.length > 0 && regs[0].rejected_at);

    const my = scores?.[0];
    const myBestScore = my?.best_score ?? null;

    const all = await pokerDb.fetch<{ fid: number }>("weekend_game_scores", {
      select: "fid",
      order: "best_score.desc",
      limit: 5000,
    });
    const myRank = all.findIndex((r: { fid: number }) => r.fid === fid) + 1 || null;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered,
        approved,
        rejected,
        registrationClosed,
        canSubmit,
        myBestScore,
        myRank: myRank || undefined,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/status]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get status" }, { status: 500 });
  }
}
