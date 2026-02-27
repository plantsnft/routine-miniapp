/**
 * PATCH /api/art-contest/submissions/[id] - Update submission title (admin only).
 * DELETE /api/art-contest/submissions/[id] - Delete submission (admin only). 400 if submission is a winner.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: submissionId } = await params;
    const rows = await pokerDb.fetch<{ id: string }>("art_contest_submissions", {
      filters: { id: submissionId },
      limit: 1,
    });
    if (!rows?.[0]) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Submission not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    if (title === undefined) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "title is required" }, { status: 400 });
    }

    await pokerDb.update("art_contest_submissions", { id: submissionId }, { title });
    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Updated." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/submissions/[id] PATCH]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to update submission" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: submissionId } = await params;
    const rows = await pokerDb.fetch<{ id: string }>("art_contest_submissions", {
      filters: { id: submissionId },
      limit: 1,
    });
    if (!rows?.[0]) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Submission not found" }, { status: 404 });
    }

    const winnerRows = await pokerDb.fetch<{ id: string }>("art_contest_winners", {
      filters: { submission_id: submissionId },
      limit: 1,
    });
    if (winnerRows?.length) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot delete a submission that is a winner. Remove from winners first." },
        { status: 400 }
      );
    }

    await pokerDb.delete("art_contest_submissions", { id: submissionId });
    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Deleted." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/submissions/[id] DELETE]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to delete submission" },
      { status: 500 }
    );
  }
}
