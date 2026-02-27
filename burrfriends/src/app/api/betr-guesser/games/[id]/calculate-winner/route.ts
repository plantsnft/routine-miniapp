/**
 * GET /api/betr-guesser/games/[id]/calculate-winner - Calculate winner (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { calculateBetrGuesserWinner } from "~/lib/betrGuesserWinner";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    const winner = await calculateBetrGuesserWinner(gameId);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: winner,
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/calculate-winner GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to calculate winner" }, { status: 500 });
  }
}
