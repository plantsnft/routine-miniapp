/**
 * POST /api/remix-betr/rounds/[id]/cancel - Cancel round (admin only)
 * Plan 12.5, 12.13: set status to 'cancelled'. Allowed when status is 'open' or 'closed'.
 * 400 if settled; idempotent if already cancelled.
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

    const { id: roundId } = await params;

    const rounds = await pokerDb.fetch<{ id: string; status: string }>("remix_betr_rounds", {
      filters: { id: roundId },
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }

    const round = rounds[0];

    if (round.status === "settled") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot cancel a round that has already been settled." },
        { status: 400 }
      );
    }

    if (round.status === "cancelled") {
      return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Round already cancelled" } });
    }

    const now = new Date().toISOString();
    await pokerDb.update("remix_betr_rounds", { id: roundId }, {
      status: "cancelled",
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Round cancelled" } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[remix-betr/rounds/[id]/cancel POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to cancel round" }, { status: 500 });
  }
}
