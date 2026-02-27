/**
 * POST /api/steal-no-steal/games/[id]/decide - Submit decision (Player B only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import { maybeTimeoutMatch } from "~/lib/steal-no-steal-auto-close";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);

    const { id: gameId } = await params;
    const body = await req.json().catch(() => ({}));
    const matchId = body.matchId;
    const decision = body.decision;

    // Phase 29.1: Fetch the game to check is_preview for admin bypass
    const gameRows = await pokerDb.fetch<{ id: string; is_preview?: boolean }>("steal_no_steal_games", {
      filters: { id: gameId },
      limit: 1,
    });
    const adminBypass = canPlayPreviewGame(fid, gameRows?.[0]?.is_preview, req);

    // Check registration (skip for admin preview bypass)
    if (!adminBypass) {
      const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
        filters: { fid },
        limit: 1,
      });
      if (!registered || registered.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
      }
    }

    if (!matchId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "matchId is required" }, { status: 400 });
    }

    if (!decision || !["steal", "no_steal"].includes(decision)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "decision must be 'steal' or 'no_steal'" }, { status: 400 });
    }

    // Get match
    const matches = await pokerDb.fetch<{
      id: string;
      player_a_fid: number;
      player_b_fid: number;
      briefcase_label: string | null;
      status: string;
      negotiation_ends_at: string; // Phase 17.1
      decision_deadline: string;
    }>("steal_no_steal_matches", {
      filters: { id: matchId },
      limit: 1,
    });

    if (!matches || matches.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Match not found" }, { status: 404 });
    }

    const match = matches[0];

    // Check if user is Player B (decider)
    if (Number(match.player_b_fid) !== fid) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Only Player B (Decider) can make a decision" }, { status: 403 });
    }

    // Check if match is still active
    if (match.status !== "active") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Decision already made or match timed out" }, { status: 400 });
    }

    // Check timeout
    const wasTimedOut = await maybeTimeoutMatch(matchId);
    if (wasTimedOut) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Time expired - decision period ended" }, { status: 400 });
    }

    // Phase 17.1: Check if negotiation period has ended
    const negotiationEndsAt = new Date(match.negotiation_ends_at).getTime();
    const currentTime = Date.now();
    if (currentTime < negotiationEndsAt) {
      const waitSeconds = Math.ceil((negotiationEndsAt - currentTime) / 1000);
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Negotiation period not over. Wait ${waitSeconds} more seconds.` 
      }, { status: 400 });
    }

    // Determine winner: YOU LOSE (bad case) vs YOU WIN (good case)
    // YOU LOSE: STEAL → holder wins; NO STEAL → decider wins
    // YOU WIN: STEAL → decider wins; NO STEAL → holder wins
    const isYouWin = match.briefcase_label === "YOU WIN";
    const winnerFid = isYouWin
      ? (decision === "steal" ? match.player_b_fid : match.player_a_fid)
      : (decision === "steal" ? match.player_a_fid : match.player_b_fid);

    // Update match
    const now = new Date().toISOString();
    await pokerDb.update("steal_no_steal_matches", { id: matchId }, {
      status: "decided",
      decision,
      decided_at: now,
      winner_fid: winnerFid,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: decision === "steal" ? "You chose to STEAL! You lost — the case was bad." : "You chose NO STEAL. The Holder keeps the case and loses — you win!",
      data: {
        decision,
        winnerFid,
        youWin: Number(winnerFid) === fid,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("Register for BETR GAMES")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("[steal-no-steal/games/[id]/decide POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit decision" }, { status: 500 });
  }
}
