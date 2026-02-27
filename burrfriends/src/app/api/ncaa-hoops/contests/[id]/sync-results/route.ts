/**
 * POST /api/ncaa-hoops/contests/[id]/sync-results – Admin: sync results from ESPN; update last_sync_at, last_sync_result_count; refresh bracket cache.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { syncContestResults } from "~/lib/ncaaHoopsEspnSync";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const result = await syncContestResults(id);

    if (result.error) {
      return NextResponse.json<ApiResponse>({ ok: false, error: result.error }, { status: 500 });
    }

    const resultCountRows = await pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_results", {
      filters: { contest_id: id },
      select: "matchup_id",
    });
    const resultCount = (resultCountRows ?? []).length;

    await pokerDb.update("ncaa_hoops_contests", { id }, {
      last_sync_at: new Date().toISOString(),
      last_sync_result_count: resultCount,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { resultsUpdated: result.resultsUpdated, resultCount, lastSyncAt: new Date().toISOString() },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[ncaa-hoops/contests/[id]/sync-results POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to sync results" }, { status: 500 });
  }
}
