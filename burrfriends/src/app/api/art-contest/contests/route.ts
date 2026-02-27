/**
 * POST /api/art-contest/contests - Create contest (admin only).
 * Body: { title?, isPreview? }. Block if any contest with status open or closed already exists (one at a time).
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
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "TO SPINFINITY AND BEYOND ART CONTEST";
    const isPreview = body.isPreview === true;

    const open = await pokerDb.fetch<{ id: string }>("art_contest", {
      filters: { status: "open" },
      limit: 1,
    });
    const closed = await pokerDb.fetch<{ id: string }>("art_contest", {
      filters: { status: "closed" },
      limit: 1,
    });
    const hasActive = (open?.length ?? 0) + (closed?.length ?? 0) > 0;
    if (hasActive) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "An active contest already exists (only one open or closed at a time)." },
        { status: 400 }
      );
    }

    const inserted = await pokerDb.insert("art_contest", [
      {
        title,
        status: "open",
        is_preview: isPreview,
        created_by_fid: fid,
      },
    ]);

    if (!inserted?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create contest" }, { status: 500 });
    }

    const contest = inserted[0] as Record<string, unknown>;
    return NextResponse.json<ApiResponse>({ ok: true, data: contest });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/contests POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to create contest" },
      { status: 500 }
    );
  }
}
