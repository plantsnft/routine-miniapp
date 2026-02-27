/**
 * GET /api/art-contest/contests/[id]
 * Single contest by id (no is_preview filter). For preview ?contestId= and game page.
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
    const rows = await pokerDb.fetch<Record<string, unknown>>("art_contest", {
      filters: { id },
      limit: 1,
    });
    const contest = rows?.[0] ?? null;
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }
    return NextResponse.json<ApiResponse>({ ok: true, data: contest });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[art-contest/contests/[id] GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch contest" },
      { status: 500 }
    );
  }
}
