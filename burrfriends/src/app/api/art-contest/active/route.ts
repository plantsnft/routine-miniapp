/**
 * GET /api/art-contest/active
 * Returns the single active contest (status open or closed, is_preview = false), or null.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const open = await pokerDb.fetch<Record<string, unknown>>("art_contest", {
      filters: { status: "open" },
      order: "created_at.desc",
      limit: 1,
    });
    const closed = await pokerDb.fetch<Record<string, unknown>>("art_contest", {
      filters: { status: "closed" },
      order: "created_at.desc",
      limit: 1,
    });

    const combined = [...(open || []), ...(closed || [])];
    const filtered = combined.filter((c) => c.is_preview !== true);
    const contest = filtered[0] ?? null;

    return NextResponse.json<ApiResponse>({ ok: true, data: contest });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[art-contest/active GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch active contest" },
      { status: 500 }
    );
  }
}
