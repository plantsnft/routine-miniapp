/**
 * POST /api/art-contest/contests/[id]/close - Set contest status to closed (admin only).
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

    const { id } = await params;
    const existing = await pokerDb.fetch<{ id: string; status: string }>("art_contest", {
      filters: { id },
      limit: 1,
    });
    const contest = existing?.[0];
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }
    if (contest.status !== "open") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Contest is not open." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await pokerDb.update("art_contest", { id }, { status: "closed", closed_at: now });

    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Contest closed." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/contests/[id]/close POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to close contest" },
      { status: 500 }
    );
  }
}
