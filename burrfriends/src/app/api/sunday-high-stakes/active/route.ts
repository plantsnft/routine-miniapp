/**
 * GET /api/sunday-high-stakes/active
 * Returns the single active contest (status open or closed, is_preview = false), or null.
 * Does not include password.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const open = await pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
      filters: { status: "open" },
      order: "created_at.desc",
      limit: 1,
    });
    const closed = await pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
      filters: { status: "closed" },
      order: "created_at.desc",
      limit: 1,
    });

    const combined = [...(open || []), ...(closed || [])];
    const filtered = combined.filter((c) => c.is_preview !== true);
    const raw = filtered[0] ?? null;
    if (!raw) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }
    const { password: _p, ...contest } = raw;
    return NextResponse.json<ApiResponse>({ ok: true, data: contest });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[sunday-high-stakes/active GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch active contest" },
      { status: 500 }
    );
  }
}
