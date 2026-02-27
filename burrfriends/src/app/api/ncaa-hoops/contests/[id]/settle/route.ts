/**
 * POST /api/ncaa-hoops/contests/[id]/settle – Require 63 results (or admin override); write settlements; set status = settled.
 * Body: { forceSettle?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: contestId } = await params;
    const body = await req.json().catch(() => ({}));
    const forceSettle = body.forceSettle === true;

    const contestRows = await pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
      filters: { id: contestId },
      limit: 1,
    });
    const contest = contestRows?.[0] ?? null;
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const status = String(contest.status);
    if (status !== "picks_closed" && status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest cannot be settled in current status." }, { status: 400 });
    }

    const resultRows = await pokerDb.fetch<{ matchup_id: number }>("ncaa_hoops_results", {
      filters: { contest_id: contestId },
      select: "matchup_id",
    });
    const resultCount = (resultRows ?? []).length;
    if (resultCount < 63 && !forceSettle) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Settle requires 63 results; found ${resultCount}. Use forceSettle to override.` },
        { status: 400 }
      );
    }

    const brackets = await pokerDb.fetch<{ id: string; fid: number; total_score: number; championship_correct: boolean }>(
      "ncaa_hoops_brackets",
      {
        filters: { contest_id: contestId },
        select: "id,fid,total_score,championship_correct",
        order: "total_score.desc,championship_correct.desc",
        limit: 500,
      }
    );

    const settlements = (brackets ?? []).map((b, i) => ({
      contest_id: contestId,
      bracket_id: b.id,
      fid: b.fid,
      position: i + 1,
      total_score: b.total_score,
    }));

    if (settlements.length > 0) {
      await pokerDb.insert("ncaa_hoops_settlements", settlements);
    }

    await pokerDb.update("ncaa_hoops_contests", { id: contestId }, { status: "settled", updated_at: new Date().toISOString() });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { contestId, status: "settled", settlementCount: settlements.length, resultCount },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[ncaa-hoops/contests/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle" }, { status: 500 });
  }
}
