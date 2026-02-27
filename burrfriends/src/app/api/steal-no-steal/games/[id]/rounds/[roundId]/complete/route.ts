/**
 * POST /api/steal-no-steal/games/[id]/rounds/[roundId]/complete - Complete round (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { autoTimeoutMatchesForRound } from "~/lib/steal-no-steal-auto-close";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roundId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId, roundId } = await params;

    // Verify round
    const rounds = await pokerDb.fetch<{ id: string; game_id: string; round_number: number; status: string }>(
      "steal_no_steal_rounds",
      { filters: { id: roundId }, limit: 1 }
    );

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }

    const round = rounds[0];
    if (round.game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round does not belong to this game" }, { status: 400 });
    }

    if (round.status !== "active") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round is not active" }, { status: 400 });
    }

    // Auto-timeout any remaining active matches
    const timedOut = await autoTimeoutMatchesForRound(roundId);

    // Get all matches to count winners
    const matches = await pokerDb.fetch<{ winner_fid: number | null; status: string }>(
      "steal_no_steal_matches",
      { filters: { round_id: roundId }, limit: 100 }
    );

    const winners = (matches || []).filter((m) => m.winner_fid).map((m) => m.winner_fid);

    // Update round status
    const now = new Date().toISOString();
    await pokerDb.update("steal_no_steal_rounds", { id: roundId }, {
      status: "completed",
      updated_at: now,
    });

    // Increment game current_round
    await pokerDb.update("steal_no_steal_games", { id: gameId }, {
      current_round: round.round_number + 1,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: `Round ${round.round_number} completed!`,
      data: {
        roundNumber: round.round_number,
        winnersCount: winners.length,
        timedOutCount: timedOut,
        nextRound: round.round_number + 1,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games/[id]/rounds/[roundId]/complete POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to complete round" }, { status: 500 });
  }
}
