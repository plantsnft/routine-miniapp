/**
 * GET /api/ncaa-hoops/contests/active
 * Returns the single active contest (status in open, picks_closed, in_progress; is_preview = false) for default community, or null.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const community = searchParams.get("community") ?? "betr";

    const contests = await pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
      filters: { community },
      order: "created_at.desc",
      limit: 10,
    });

    const activeStatuses = ["open", "picks_closed", "in_progress"];
    const filtered = (contests ?? []).filter(
      (c) => activeStatuses.includes(String(c.status)) && c.is_preview !== true
    );
    const contest = filtered[0] ?? null;

    return NextResponse.json<ApiResponse>({ ok: true, data: contest });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[ncaa-hoops/contests/active GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch active contest" },
      { status: 500 }
    );
  }
}
