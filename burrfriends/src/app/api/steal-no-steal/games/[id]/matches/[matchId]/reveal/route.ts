/**
 * POST /api/steal-no-steal/games/[id]/matches/[matchId]/reveal - Reveal outcome (admin only)
 * Phase 17 YOU WIN: when briefcase_label = 'YOU WIN', outcome hidden until admin reveals.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId, matchId } = await params;

    // Get match and verify it belongs to this game
    const matches = await pokerDb.fetch<{
      id: string;
      round_id: string;
      status: string;
      briefcase_label: string | null;
    }>("steal_no_steal_matches", {
      filters: { id: matchId },
      limit: 1,
    });

    if (!matches || matches.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Match not found" }, { status: 404 });
    }

    const match = matches[0];

    // Verify match's round belongs to game
    const rounds = await pokerDb.fetch<{ id: string; game_id: string }>("steal_no_steal_rounds", {
      filters: { id: match.round_id },
      limit: 1,
    });

    if (!rounds || rounds.length === 0 || rounds[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Match not found" }, { status: 404 });
    }

    if (match.status !== "decided" && match.status !== "timeout") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Match is not decided or timed out" }, { status: 400 });
    }

    const iso = new Date().toISOString();
    await pokerDb.update("steal_no_steal_matches", { id: matchId }, {
      outcome_revealed_at: iso,
      updated_at: iso,
    });

    return NextResponse.json<ApiResponse>({ ok: true, message: "Outcome revealed" });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games/[id]/matches/[matchId]/reveal POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to reveal" }, { status: 500 });
  }
}
