/**
 * GET /api/ncaa-hoops/contests/[id]/leaderboard
 * Leaderboard from cached total_score, championship_correct (order by total_score DESC, championship_correct DESC).
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const contestRows = await pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
      filters: { id },
      limit: 1,
    });
    if (!contestRows?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const brackets = await pokerDb.fetch<{ id: string; fid: number; total_score: number; championship_correct: boolean }>(
      "ncaa_hoops_brackets",
      {
        filters: { contest_id: id },
        select: "id,fid,total_score,championship_correct",
        order: "total_score.desc,championship_correct.desc",
        limit: 100,
      }
    );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: (brackets ?? []).map((b, i) => ({
        rank: i + 1,
        bracketId: b.id,
        fid: b.fid,
        totalScore: b.total_score,
        championshipCorrect: b.championship_correct,
      })),
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[ncaa-hoops/contests/[id]/leaderboard GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
