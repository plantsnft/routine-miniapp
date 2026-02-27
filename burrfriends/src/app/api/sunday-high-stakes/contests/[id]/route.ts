/**
 * GET /api/sunday-high-stakes/contests/[id]
 * Single contest by id (no is_preview filter). For preview ?contestId= and game page.
 * Does not return password (only returned after successful submit).
 *
 * PATCH /api/sunday-high-stakes/contests/[id]
 * Update contest (admin only). Body: { qcUrl?: string }. Updates qc_url (null if empty). Contest can be open or closed.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
      filters: { id },
      limit: 1,
    });
    const contest = rows?.[0] ?? null;
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }
    const { password: _p, ...safe } = contest;
    return NextResponse.json<ApiResponse>({ ok: true, data: safe });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[sunday-high-stakes/contests/[id] GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch contest" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
      filters: { id },
      limit: 1,
    });
    const contest = existing?.[0];
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const qcUrl =
      typeof body.qcUrl === "string" && body.qcUrl.trim()
        ? body.qcUrl.trim()
        : undefined;
    const startsAt =
      typeof body.startsAt === "string"
        ? (body.startsAt.trim() || null)
        : undefined;

    const updates: Record<string, unknown> = {};
    if (qcUrl !== undefined) updates.qc_url = qcUrl === "" ? null : qcUrl;
    if (startsAt !== undefined) updates.starts_at = startsAt;
    if (Object.keys(updates).length > 0) {
      await pokerDb.update("sunday_high_stakes", { id }, updates);
    }

    const updated = await pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
      filters: { id },
      limit: 1,
    });
    const row = updated?.[0] ?? contest;
    const { password: _p, ...safe } = row;
    return NextResponse.json<ApiResponse>({ ok: true, data: safe });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[sunday-high-stakes/contests/[id] PATCH]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to update contest" },
      { status: 500 }
    );
  }
}
