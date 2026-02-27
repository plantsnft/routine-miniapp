/**
 * POST /api/art-contest/contests/[id]/settle - Mark contest as settled (admin only).
 * Contest must be closed and have exactly 14 winners.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const POSITIONS = 14;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: contestId } = await params;
    const contests = await pokerDb.fetch<{ id: string; status: string }>("art_contest", {
      filters: { id: contestId },
      limit: 1,
    });
    const contest = contests?.[0];
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }
    if (contest.status !== "closed") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Contest must be closed before settling." },
        { status: 400 }
      );
    }

    const winners = await pokerDb.fetch<{ id: string }>("art_contest_winners", {
      filters: { contest_id: contestId },
      limit: 20,
    });
    if (!winners || winners.length !== POSITIONS) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Exactly ${POSITIONS} winners must be set before settling.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await pokerDb.update("art_contest", { id: contestId }, { status: "settled", settled_at: now });

    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Contest settled." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/contests/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to settle contest" },
      { status: 500 }
    );
  }
}
