/**
 * DELETE /api/art-contest/contests/[id]/winners/[submissionId] - Remove one winner (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: contestId, submissionId } = await params;
    const contests = await pokerDb.fetch<{ id: string; status: string }>("art_contest", {
      filters: { id: contestId },
      limit: 1,
    });
    const contest = contests?.[0];
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }
    if (contest.status === "settled") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Contest is already settled." },
        { status: 400 }
      );
    }

    const rows = await pokerDb.fetch<{ id: string }>("art_contest_winners", {
      filters: { contest_id: contestId, submission_id: submissionId },
      limit: 1,
    });
    const winner = rows?.[0];
    if (!winner) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Winner entry not found" }, { status: 404 });
    }

    await pokerDb.delete("art_contest_winners", { id: winner.id });
    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Removed from winners." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/contests/[id]/winners/[submissionId] DELETE]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to remove winner" },
      { status: 500 }
    );
  }
}
