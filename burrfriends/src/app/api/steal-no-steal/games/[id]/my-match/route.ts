/**
 * GET /api/steal-no-steal/games/[id]/my-match - Get user's current match
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import { maybeTimeoutMatch } from "~/lib/steal-no-steal-auto-close";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);

    const { id: gameId } = await params;

    // Get game (moved before registration for Phase 29.1)
    const games = await pokerDb.fetch<{ id: string; current_round: number; status: string; is_preview?: boolean }>(
      "steal_no_steal_games",
      { filters: { id: gameId }, limit: 1 }
    );

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Phase 29.1: Admin preview bypass — skip registration for preview games
    const adminBypass = canPlayPreviewGame(fid, game.is_preview, req);

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

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }

    // Get current round
    const rounds = await pokerDb.fetch<{ id: string; round_number: number; status: string }>(
      "steal_no_steal_rounds",
      { filters: { game_id: gameId, status: "active" }, limit: 1 }
    );

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }

    const round = rounds[0];

    // Find user's match in this round
    const matchesA = await pokerDb.fetch<{
      id: string;
      match_number: number;
      player_a_fid: number;
      player_b_fid: number;
      briefcase_amount: number;
      briefcase_label?: string | null;
      outcome_revealed_at?: string | null;
      negotiation_ends_at: string;
      decision_deadline: string;
      status: string;
      decision: string | null;
      decided_at: string | null;
      winner_fid: number | null;
    }>("steal_no_steal_matches", {
      filters: { round_id: round.id, player_a_fid: fid },
      limit: 1,
    });

    const matchesB = await pokerDb.fetch<{
      id: string;
      match_number: number;
      player_a_fid: number;
      player_b_fid: number;
      briefcase_amount: number;
      briefcase_label?: string | null;
      outcome_revealed_at?: string | null;
      negotiation_ends_at: string;
      decision_deadline: string;
      status: string;
      decision: string | null;
      decided_at: string | null;
      winner_fid: number | null;
    }>("steal_no_steal_matches", {
      filters: { round_id: round.id, player_b_fid: fid },
      limit: 1,
    });

    const match = matchesA?.[0] || matchesB?.[0];

    if (!match) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }

    // Check and handle timeout
    if (match.status === "active") {
      await maybeTimeoutMatch(match.id);
      // Refetch to get updated status
      const refreshed = await pokerDb.fetch<{
        status: string;
        decision: string | null;
        winner_fid: number | null;
      }>("steal_no_steal_matches", { filters: { id: match.id }, limit: 1 });
      if (refreshed?.[0]) {
        match.status = refreshed[0].status;
        match.decision = refreshed[0].decision;
        match.winner_fid = refreshed[0].winner_fid;
      }
    }

    // Determine role
    const isPlayerA = Number(match.player_a_fid) === fid;
    const role = isPlayerA ? "holder" : "decider";
    const opponentFid = isPlayerA ? match.player_b_fid : match.player_a_fid;

    // Get opponent profile
    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("steal_no_steal_signups", {
      filters: { game_id: gameId },
      limit: 100,
    });

    const opponentProfile = signups?.find((s) => Number(s.fid) === Number(opponentFid));

    // Phase 17.1: Calculate both negotiation and decision time remaining
    const negotiationEndsAt = new Date(match.negotiation_ends_at).getTime();
    const decisionDeadline = new Date(match.decision_deadline).getTime();
    const now = Date.now();
    const negotiationTimeRemaining = Math.max(0, Math.floor((negotiationEndsAt - now) / 1000));
    const decisionTimeRemaining = Math.max(0, Math.floor((decisionDeadline - now) / 1000));

    // Phase 17.1: canDecide only AFTER negotiation ends and BEFORE decision deadline
    const canDecide = role === "decider" && match.status === "active" && now >= negotiationEndsAt && now < decisionDeadline;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        matchId: match.id,
        matchNumber: match.match_number,
        roundId: round.id,
        roundNumber: round.round_number,
        role,
        briefcaseAmount: match.briefcase_amount,
        briefcaseLabel: match.briefcase_label ?? null,
        outcomeRevealedAt: match.outcome_revealed_at ?? null,
        negotiationEndsAt: match.negotiation_ends_at, // Phase 17.1
        negotiationTimeRemaining, // Phase 17.1
        decisionDeadline: match.decision_deadline,
        decisionTimeRemaining, // Phase 17.1
        // Keep timeRemaining for backward compatibility (same as decisionTimeRemaining)
        timeRemaining: decisionTimeRemaining,
        status: match.status,
        decision: match.decision,
        winnerFid: match.winner_fid,
        opponent: opponentProfile
          ? { fid: opponentFid, username: opponentProfile.username, display_name: opponentProfile.display_name, pfp_url: opponentProfile.pfp_url }
          : { fid: opponentFid, username: null, display_name: null, pfp_url: null },
        canDecide,
        chatEnabled: match.status === "active",
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
    console.error("[steal-no-steal/games/[id]/my-match GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch match" }, { status: 500 });
  }
}
