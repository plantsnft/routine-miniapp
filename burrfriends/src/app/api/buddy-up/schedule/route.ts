/**
 * POST /api/buddy-up/schedule - Set or clear "Next BUDDY UP" time (admin only)
 * Body: { clear?: boolean } | { inHours?: number } | { nextRunAt?: string } — one per request.
 * clear: set next_run_at = null.
 * inHours: next_run_at = now + inHours * 3600 seconds.
 * nextRunAt: ISO string, set next_run_at to that time.
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
    const now = new Date().toISOString();
    let nextRunAt: string | null = null;

    if (body.clear === true) {
      nextRunAt = null;
    } else if (typeof body.inHours === "number" && body.inHours > 0 && body.inHours <= 168) {
      // cap 168h = 1 week
      const at = new Date(Date.now() + body.inHours * 3600 * 1000);
      nextRunAt = at.toISOString();
    } else if (typeof body.nextRunAt === "string" && body.nextRunAt.trim()) {
      const at = new Date(body.nextRunAt.trim());
      if (isNaN(at.getTime())) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid nextRunAt date" }, { status: 400 });
      }
      nextRunAt = at.toISOString();
    } else {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: "Provide one of: { clear: true }, { inHours: number }, or { nextRunAt: string }",
      }, { status: 400 });
    }

    // Ensure row exists (migration may not have run yet in dev)
    const existing = await pokerDb.fetch<{ id: number }>("buddy_up_schedule", { filters: { id: 1 }, limit: 1 });
    if (!existing || existing.length === 0) {
      await pokerDb.insert("buddy_up_schedule", [{
        id: 1,
        next_run_at: nextRunAt,
        updated_at: now,
        updated_by_fid: fid,
      }]);
    } else {
      await pokerDb.update("buddy_up_schedule", { id: 1 }, {
        next_run_at: nextRunAt,
        updated_at: now,
        updated_by_fid: fid,
      });
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: { nextRunAt } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/schedule POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to update schedule" }, { status: 500 });
  }
}
