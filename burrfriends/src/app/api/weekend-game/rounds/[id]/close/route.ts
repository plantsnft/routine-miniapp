/**
 * POST /api/weekend-game/rounds/[id]/close - Close round (admin only)
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

    const rounds = await pokerDb.fetch<{ id: string; status: string }>("weekend_game_rounds", {
      filters: { id: roundId },
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }

    if (rounds[0].status !== "open") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Round is not open (already closed, settled, or cancelled)." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await pokerDb.update("weekend_game_rounds", { id: roundId }, {
      status: "closed",
      closed_at: now,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Round closed." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/rounds/[id]/close POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to close round" }, { status: 500 });
  }
}
