/**
 * POST /api/ncaa-hoops/contests/[id]/close-picks – Set status = picks_closed (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
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
    const rows = await pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
      filters: { id },
      limit: 1,
    });
    const contest = rows?.[0] ?? null;
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }
    if (String(contest.status) !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest is not open; cannot close picks." }, { status: 400 });
    }

    await pokerDb.update("ncaa_hoops_contests", { id }, { status: "picks_closed", updated_at: new Date().toISOString() });

    return NextResponse.json<ApiResponse>({ ok: true, data: { id, status: "picks_closed" } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[ncaa-hoops/contests/[id]/close-picks POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to close picks" }, { status: 500 });
  }
}
