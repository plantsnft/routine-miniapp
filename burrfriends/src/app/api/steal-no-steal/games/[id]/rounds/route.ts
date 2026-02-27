/**
 * POST /api/steal-no-steal/games/[id]/rounds - Create new round (admin only)
 * Body: { customMatches?: [{ playerAFid, playerBFid, briefcaseAmount }], byePlayerFid?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

// Shuffle array (Fisher-Yates)
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;
    const body = await req.json().catch(() => ({}));
    const customMatches = Array.isArray(body.customMatches) ? body.customMatches : undefined;
    const byePlayerFid = typeof body.byePlayerFid === "number" ? body.byePlayerFid : null;

    // Get game
    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      current_round: number;
      prize_amount: number;
      decision_time_seconds: number;
      decision_window_seconds: number; // Phase 17.1
    }>("steal_no_steal_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    // Check if round already exists
    const existingRound = await pokerDb.fetch<{ id: string }>("steal_no_steal_rounds", {
      filters: { game_id: gameId, round_number: game.current_round },
      limit: 1,
    });

    if (existingRound && existingRound.length > 0) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: `Round ${game.current_round} already exists. Complete it before creating the next round.`,
      }, { status: 400 });
    }

    // Get eligible players
    let eligibleFids: number[] = [];

    if (game.current_round === 1) {
      // Round 1: use all signups
      const signups = await pokerDb.fetch<{ fid: number }>("steal_no_steal_signups", {
        filters: { game_id: gameId },
        limit: 100,
      });
      eligibleFids = (signups || []).map((s) => Number(s.fid));
    } else {
      // Later rounds: use winners from previous round + bye player from previous round
      const prevRound = await pokerDb.fetch<{ id: string; bye_player_fid?: number }>("steal_no_steal_rounds", {
        filters: { game_id: gameId, round_number: game.current_round - 1 },
        limit: 1,
      });

      if (prevRound && prevRound.length > 0) {
        const matches = await pokerDb.fetch<{ winner_fid: number }>("steal_no_steal_matches", {
          filters: { round_id: prevRound[0].id },
          limit: 100,
        });
        eligibleFids = (matches || [])
          .map((m) => Number(m.winner_fid))
          .filter((fid) => fid > 0);
        
        // Include bye player from previous round
        if (prevRound[0].bye_player_fid) {
          const byeFid = Number(prevRound[0].bye_player_fid);
          if (byeFid > 0 && !eligibleFids.includes(byeFid)) {
            eligibleFids.push(byeFid);
          }
        }
      }
    }

    if (eligibleFids.length < 2) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Need at least 2 eligible players" }, { status: 400 });
    }

    // Validate bye player if provided
    if (byePlayerFid !== null && !eligibleFids.includes(byePlayerFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: `Bye player FID ${byePlayerFid} is not eligible` }, { status: 400 });
    }

    // Remove bye player from eligible pool for pairing
    const pairingFids = byePlayerFid !== null 
      ? eligibleFids.filter((fid) => fid !== byePlayerFid)
      : eligibleFids;

    // Build matches (Phase 17 special: optional briefcaseLabel; when set, briefcaseAmount may be 0)
    type MatchDef = { playerAFid: number; playerBFid: number; briefcaseAmount: number; briefcaseLabel?: string | null };
    const matches: MatchDef[] = [];

    if (customMatches && customMatches.length > 0) {
      const usedFids = new Set<number>();
      for (const match of customMatches) {
        const playerAFid = Number(match.playerAFid);
        const playerBFid = Number(match.playerBFid);
        const briefcaseAmount = parseFloat(String(match.briefcaseAmount ?? "0"));
        const briefcaseLabel = typeof match.briefcaseLabel === "string" ? match.briefcaseLabel.trim() || null : null;

        if (!pairingFids.includes(playerAFid)) {
          return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${playerAFid} is not eligible for pairing` }, { status: 400 });
        }
        if (!pairingFids.includes(playerBFid)) {
          return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${playerBFid} is not eligible for pairing` }, { status: 400 });
        }
        if (usedFids.has(playerAFid)) {
          return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${playerAFid} appears in multiple matches` }, { status: 400 });
        }
        if (usedFids.has(playerBFid)) {
          return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${playerBFid} appears in multiple matches` }, { status: 400 });
        }
        if (playerAFid === playerBFid) {
          return NextResponse.json<ApiResponse>({ ok: false, error: "Player A and B must be different" }, { status: 400 });
        }
        if (briefcaseLabel) {
          if (isNaN(briefcaseAmount) || briefcaseAmount < 0) {
            return NextResponse.json<ApiResponse>({ ok: false, error: "briefcaseAmount must be >= 0 when briefcaseLabel is set" }, { status: 400 });
          }
        } else {
          if (isNaN(briefcaseAmount) || briefcaseAmount <= 0) {
            return NextResponse.json<ApiResponse>({ ok: false, error: "briefcaseAmount must be positive" }, { status: 400 });
          }
        }

        usedFids.add(playerAFid);
        usedFids.add(playerBFid);
        matches.push({ playerAFid, playerBFid, briefcaseAmount, briefcaseLabel: briefcaseLabel ?? undefined });
      }
    } else {
      // Random pairing (uses pairingFids - excludes bye player)
      const shuffled = shuffle(pairingFids);
      const numMatches = Math.floor(shuffled.length / 2);
      const defaultAmount = numMatches > 0 ? game.prize_amount / numMatches : game.prize_amount;

      for (let i = 0; i + 1 < shuffled.length; i += 2) {
        // Randomly assign roles
        const [a, b] = Math.random() < 0.5 ? [shuffled[i], shuffled[i + 1]] : [shuffled[i + 1], shuffled[i]];
        matches.push({
          playerAFid: a,
          playerBFid: b,
          briefcaseAmount: defaultAmount,
        });
      }
    }

    if (matches.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No matches could be created" }, { status: 400 });
    }

    // Create round (include bye_player_fid if provided)
    const now = new Date().toISOString();
    const roundInsert: Record<string, unknown> = {
      game_id: gameId,
      round_number: game.current_round,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    if (byePlayerFid !== null) {
      roundInsert.bye_player_fid = byePlayerFid;
    }
    const round = await pokerDb.insert(
      "steal_no_steal_rounds",
      [roundInsert],
      "id"
    );

    if (!round || round.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create round" }, { status: 500 });
    }

    const roundId = (round[0] as unknown as { id: string }).id;
    // Phase 17.1: Calculate both negotiation end and decision deadline
    const nowMs = Date.now();
    const decisionWindowSeconds = game.decision_window_seconds || 300; // default 5 min
    const negotiationEndsAt = new Date(nowMs + game.decision_time_seconds * 1000).toISOString();
    const decisionDeadline = new Date(nowMs + (game.decision_time_seconds + decisionWindowSeconds) * 1000).toISOString();

    // Create matches (Phase 17 special: include briefcase_label when set)
    const matchInserts = matches.map((m, idx) => ({
      round_id: roundId,
      match_number: idx + 1,
      player_a_fid: m.playerAFid,
      player_b_fid: m.playerBFid,
      briefcase_amount: m.briefcaseAmount,
      ...(m.briefcaseLabel != null && m.briefcaseLabel !== "" && { briefcase_label: m.briefcaseLabel }),
      negotiation_ends_at: negotiationEndsAt,
      decision_deadline: decisionDeadline,
      status: "active",
      created_at: now,
      updated_at: now,
    }));

    await pokerDb.insert("steal_no_steal_matches", matchInserts);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        roundId,
        roundNumber: game.current_round,
        matches: matches.map((m, idx) => ({
          matchNumber: idx + 1,
          playerAFid: m.playerAFid,
          playerBFid: m.playerBFid,
          briefcaseAmount: m.briefcaseAmount,
        })),
        byePlayerFid: byePlayerFid,
        negotiationEndsAt, // Phase 17.1
        decisionDeadline,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games/[id]/rounds POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create round" }, { status: 500 });
  }
}
