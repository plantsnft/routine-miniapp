/**
 * POST /api/sunday-high-stakes/contests - Create contest (admin only).
 * Body: { title?, password, clubggUrl?, qcUrl?, isPreview? }. Block if any contest with status open or closed already exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { SUNDAY_HIGH_STAKES_CLUBGG_URL } from "~/lib/constants";
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
        : "SUNDAY HIGH STAKES ARE BETR";
    const password = typeof body.password === "string" && body.password.trim() ? body.password.trim() : "";
    if (!password) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Password is required." }, { status: 400 });
    }
    const clubggUrl =
      typeof body.clubggUrl === "string" && body.clubggUrl.trim()
        ? body.clubggUrl.trim()
        : SUNDAY_HIGH_STAKES_CLUBGG_URL;
    const qcUrl =
      typeof body.qcUrl === "string" && body.qcUrl.trim() ? body.qcUrl.trim() : null;
    const startsAt =
      typeof body.startsAt === "string" && body.startsAt.trim()
        ? body.startsAt.trim()
        : null;
    const isPreview = body.isPreview === true;

    const open = await pokerDb.fetch<{ id: string }>("sunday_high_stakes", {
      filters: { status: "open" },
      limit: 1,
    });
    const closed = await pokerDb.fetch<{ id: string }>("sunday_high_stakes", {
      filters: { status: "closed" },
      limit: 1,
    });
    const hasActive = (open?.length ?? 0) + (closed?.length ?? 0) > 0;
    if (hasActive) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "An active SUNDAY HIGH STAKES contest already exists (only one open or closed at a time)." },
        { status: 400 }
      );
    }

    const inserted = await pokerDb.insert("sunday_high_stakes", [
      {
        title,
        status: "open",
        is_preview: isPreview,
        created_by_fid: fid,
        password,
        clubgg_url: clubggUrl,
        qc_url: qcUrl,
        starts_at: startsAt,
      },
    ]);

    if (!inserted?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create contest" }, { status: 500 });
    }

    const contest = inserted[0] as Record<string, unknown>;
    const { password: _p, ...safe } = contest;
    return NextResponse.json<ApiResponse>({ ok: true, data: safe });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[sunday-high-stakes/contests POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to create contest" },
      { status: 500 }
    );
  }
}
