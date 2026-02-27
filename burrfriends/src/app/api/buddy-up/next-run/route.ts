/**
 * GET /api/buddy-up/next-run - Get scheduled "Next BUDDY UP" time (public)
 * Returns { nextRunAt: string | null }. If next_run_at is in the past, clears it and returns null.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const rows = await pokerDb.fetch<{ next_run_at: string | null }>("buddy_up_schedule", {
      filters: { id: 1 },
      limit: 1,
    });

    const row = rows?.[0];
    const nextRunAt = row?.next_run_at ?? null;

    if (nextRunAt) {
      const at = new Date(nextRunAt).getTime();
      if (at <= Date.now()) {
        // In the past: clear and return null
        await pokerDb.update("buddy_up_schedule", { id: 1 }, {
          next_run_at: null,
          updated_at: new Date().toISOString(),
        });
        return NextResponse.json<ApiResponse>({ ok: true, data: { nextRunAt: null } });
      }
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: { nextRunAt } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[buddy-up/next-run GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch next run" }, { status: 500 });
  }
}
