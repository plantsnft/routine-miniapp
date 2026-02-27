/**
 * POST /api/superbowl-squares/games/[id]/settle - Settlement with preview, pay-one, and finalize
 * 
 * Modes:
 * - { preview: true } → Calculate and return all 4 quarter winners. No transfers, no DB writes.
 * - { preview: false, payIndex: 0-3 } → Pay one specific quarter winner. Insert settlement record.
 * - { finalize: true } → Check all 4 settlements exist, mark game as "settled".
 * 
 * Uses settlement-core.ts for unified payout logic
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import {
  fetchBulkWalletAddressesForWinners,
  resolveWinners,
  transferBETRToWinners,
  type WinnerEntry,
} from "~/lib/settlement-core";
import type { ApiResponse } from "~/lib/types";

interface QuarterWinner {
  quarter: 'q1' | 'halftime' | 'q3' | 'final';
  rowDigit: number;
  colDigit: number;
  squareIndex: number;
  fid: number;
  displayName: string | null;
  prizeAmount: number;
}

function calculateWinningSquare(
  team1Score: number,
  team2Score: number,
  rowNumbers: number[],
  colNumbers: number[]
): { rowDigit: number; colDigit: number; squareIndex: number } {
  const team1LastDigit = team1Score % 10;
  const team2LastDigit = team2Score % 10;
  const rowIndex = rowNumbers.indexOf(team1LastDigit);
  const colIndex = colNumbers.indexOf(team2LastDigit);
  const squareIndex = rowIndex * 10 + colIndex;
  return { rowDigit: team1LastDigit, colDigit: team2LastDigit, squareIndex };
}

const QUARTER_LABELS: Record<string, string> = {
  q1: 'Q1',
  halftime: 'Halftime',
  q3: 'Q3',
  final: 'Final',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid: adminFid } = await requireAuth(req);
    if (!isAdmin(adminFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game ID required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const preview = body.preview === true;
    const finalize = body.finalize === true;
    const payIndex = typeof body.payIndex === 'number' ? body.payIndex : null;

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // ========== FINALIZE MODE ==========
    if (finalize) {
      if (game.status === "settled") {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Game is already settled" }, { status: 400 });
      }
      if (game.status !== "locked") {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Cannot finalize game in ${game.status} status` }, { status: 400 });
      }

      const existingSettlements = await pokerDb.fetch<any>("superbowl_squares_settlements", {
        filters: { game_id: gameId },
        limit: 10,
      });

      const settledQuarters = new Set((existingSettlements || []).map((s: any) => s.quarter));
      const allQuarters = ['q1', 'halftime', 'q3', 'final'];
      const missing = allQuarters.filter(q => !settledQuarters.has(q));

      if (missing.length > 0) {
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: `Cannot finalize. Missing payments for: ${missing.map(q => QUARTER_LABELS[q]).join(', ')}`
        }, { status: 400 });
      }

      const now = new Date().toISOString();
      const firstTxHash = (existingSettlements || [])[0]?.tx_hash || '';

      await pokerDb.update(
        "superbowl_squares_games",
        { id: gameId },
        {
          status: "settled",
          settled_by_fid: adminFid,
          settled_at: now,
          settle_tx_hash: firstTxHash,
          updated_at: now,
        }
      );

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { message: "Game finalized! Status set to settled.", settledQuarters: allQuarters },
      });
    }

    // ========== SHARED VALIDATION (preview + pay) ==========
    if (game.status !== "locked") {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: `Cannot settle game in ${game.status} status. Must be in 'locked' status.`
      }, { status: 400 });
    }

    if (!game.row_numbers || !game.col_numbers) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: "Numbers must be randomized before settling"
      }, { status: 400 });
    }

    const hasAllScores =
      game.score_q1_team1 !== null && game.score_q1_team2 !== null &&
      game.score_halftime_team1 !== null && game.score_halftime_team2 !== null &&
      game.score_q3_team1 !== null && game.score_q3_team2 !== null &&
      game.score_final_team1 !== null && game.score_final_team2 !== null;

    if (!hasAllScores) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: "All scores (Q1, Halftime, Q3, Final) must be entered before settling"
      }, { status: 400 });
    }

    // Fetch all claims
    const claims = await pokerDb.fetch<any>("superbowl_squares_claims", {
      filters: { game_id: gameId },
      limit: 100,
    });

    if (!claims || claims.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: "No claims found for this game"
      }, { status: 400 });
    }

    // Build claims map
    const claimsMap = new Map<number, any>();
    for (const claim of claims) {
      claimsMap.set(claim.square_index, claim);
    }

    // Calculate winning squares for each quarter
    const rowNumbers: number[] = game.row_numbers;
    const colNumbers: number[] = game.col_numbers;

    const quarters: Array<{
      quarter: 'q1' | 'halftime' | 'q3' | 'final';
      team1Score: number;
      team2Score: number;
      prizePct: number;
    }> = [
      { quarter: 'q1', team1Score: game.score_q1_team1, team2Score: game.score_q1_team2, prizePct: game.prize_q1_pct },
      { quarter: 'halftime', team1Score: game.score_halftime_team1, team2Score: game.score_halftime_team2, prizePct: game.prize_halftime_pct },
      { quarter: 'q3', team1Score: game.score_q3_team1, team2Score: game.score_q3_team2, prizePct: game.prize_q2_pct },
      { quarter: 'final', team1Score: game.score_final_team1, team2Score: game.score_final_team2, prizePct: game.prize_final_pct },
    ];

    const quarterWinners: QuarterWinner[] = [];

    for (const q of quarters) {
      const { rowDigit, colDigit, squareIndex } = calculateWinningSquare(
        q.team1Score,
        q.team2Score,
        rowNumbers,
        colNumbers
      );

      const winningClaim = claimsMap.get(squareIndex);
      if (!winningClaim) {
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: `Winning square ${squareIndex} for ${q.quarter} is unclaimed`
        }, { status: 400 });
      }

      const prizeAmount = Math.floor(game.total_prize_pool * q.prizePct);

      quarterWinners.push({
        quarter: q.quarter,
        rowDigit,
        colDigit,
        squareIndex,
        fid: winningClaim.fid,
        displayName: winningClaim.display_name,
        prizeAmount,
      });
    }

    // Fetch wallet addresses for all winners
    const winnerFids = [...new Set(quarterWinners.map(w => w.fid))];
    const addressMap = await fetchBulkWalletAddressesForWinners(winnerFids);

    // Fetch existing settlements to know what's already paid
    const existingSettlements = await pokerDb.fetch<any>("superbowl_squares_settlements", {
      filters: { game_id: gameId },
      limit: 10,
    });
    const settledQuarters = new Set((existingSettlements || []).map((s: any) => s.quarter));
    const settledTxMap = new Map<string, string>();
    for (const s of existingSettlements || []) {
      settledTxMap.set(s.quarter, s.tx_hash || '');
    }

    // ========== PREVIEW MODE ==========
    if (preview) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          preview: true,
          winners: quarterWinners.map((qw, i) => {
            const walletAddress = addressMap.get(qw.fid) || 'unknown';
            return {
              index: i,
              quarter: qw.quarter,
              quarterLabel: QUARTER_LABELS[qw.quarter],
              fid: qw.fid,
              displayName: qw.displayName,
              squareIndex: qw.squareIndex,
              rowDigit: qw.rowDigit,
              colDigit: qw.colDigit,
              prizeAmount: qw.prizeAmount,
              walletAddress,
              alreadyPaid: settledQuarters.has(qw.quarter),
              txHash: settledTxMap.get(qw.quarter) || null,
            };
          }),
        },
      });
    }

    // ========== PAY ONE MODE ==========
    if (payIndex === null || payIndex < 0 || payIndex > 3) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: "payIndex (0-3) required for payment"
      }, { status: 400 });
    }

    const qw = quarterWinners[payIndex];

    // Check if this quarter is already paid
    if (settledQuarters.has(qw.quarter)) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: `${QUARTER_LABELS[qw.quarter]} is already paid`
      }, { status: 400 });
    }

    // Prepare and transfer to this one winner
    const winnerEntry: WinnerEntry = {
      fid: qw.fid,
      amount: qw.prizeAmount,
      position: payIndex + 1,
    };

    const resolved = resolveWinners([winnerEntry], addressMap);
    const txHashes = await transferBETRToWinners(resolved);
    const txHash = txHashes[0] || '';

    // Insert settlement record for this quarter
    const now = new Date().toISOString();
    await pokerDb.insert("superbowl_squares_settlements", [
      {
        game_id: gameId,
        winner_fid: qw.fid,
        quarter: qw.quarter,
        prize_amount: qw.prizeAmount,
        square_index: qw.squareIndex,
        row_digit: qw.rowDigit,
        col_digit: qw.colDigit,
        settled_by_fid: adminFid,
        settled_at: now,
        tx_hash: txHash,
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: `${QUARTER_LABELS[qw.quarter]} paid!`,
        quarter: qw.quarter,
        quarterLabel: QUARTER_LABELS[qw.quarter],
        fid: qw.fid,
        displayName: qw.displayName,
        prizeAmount: qw.prizeAmount,
        txHash,
        txUrl: `https://basescan.org/tx/${txHash}`,
        paidSoFar: settledQuarters.size + 1,
        totalToPay: 4,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-squares/games/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle game" }, { status: 500 });
  }
}
