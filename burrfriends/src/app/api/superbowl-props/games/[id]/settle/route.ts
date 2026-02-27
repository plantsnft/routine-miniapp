/**
 * POST /api/superbowl-props/games/[id]/settle - Settlement with preview, pay-one, and finalize
 * 
 * Modes:
 * - { preview: true } → Calculate 4 winners (top 3 + last), check BETR Believer Bonus. No transfers.
 * - { preview: false, payIndex: 0-3 } → Pay one specific winner. Insert settlement record.
 * - { finalize: true } → Check all 4 settlements exist, mark game as "settled".
 * 
 * Phase 26.13: BETR Believer Bonus (+5M if ≥50M staked)
 * Uses settlement-core.ts for unified payout logic
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { checkUserStakeByFid } from "~/lib/staking";
import {
  fetchBulkWalletAddressesForWinners,
  resolveWinners,
  selectWalletAddress,
  transferBETRToWinners,
  type WinnerEntry,
} from "~/lib/settlement-core";
import type { ApiResponse } from "~/lib/types";

// BETR Believer Bonus constants
const BONUS_STAKE_THRESHOLD = 50_000_000; // 50M BETR
const BONUS_AMOUNT = 5_000_000; // 5M BETR

const PRIZE_LABELS = ["1st (Most Correct)", "2nd", "3rd", "Last (Least Correct)"];

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
    const games = await pokerDb.fetch<any>("superbowl_props_games", {
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

      const existingSettlements = await pokerDb.fetch<any>("superbowl_props_settlements", {
        filters: { game_id: gameId },
        limit: 10,
      });

      const settledCount = (existingSettlements || []).length;
      if (settledCount < 4) {
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: `Cannot finalize. Only ${settledCount}/4 winners paid.`
        }, { status: 400 });
      }

      const now = new Date().toISOString();
      const firstTxHash = (existingSettlements || [])[0]?.tx_hash || '';

      await pokerDb.update("superbowl_props_games", { id: gameId }, {
        status: "settled",
        settled_at: now,
        settle_tx_hash: firstTxHash,
      });

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { message: "Game finalized! Status set to settled." },
      });
    }

    // ========== SHARED VALIDATION (preview + pay) ==========
    if (game.status === "settled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is already settled" }, { status: 400 });
    }

    if (game.answers_json === null || game.actual_total_score === null) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Must enter results before settling" }, { status: 400 });
    }

    // Fetch all submissions with scores
    const submissions = await pokerDb.fetch<any>("superbowl_props_submissions", {
      filters: { game_id: gameId },
      limit: 1000,
    });

    if (!submissions || submissions.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No submissions to settle" }, { status: 400 });
    }

    const scoredSubmissions = submissions.filter((s: any) => s.score !== null);

    if (scoredSubmissions.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No scored submissions. Enter results first." }, { status: 400 });
    }

    if (scoredSubmissions.length < 4) {
      return NextResponse.json<ApiResponse>({ ok: false, error: `Need at least 4 scored submissions to settle (have ${scoredSubmissions.length})` }, { status: 400 });
    }

    // Rank by score DESC, then by tiebreaker (closest to actual total)
    const ranked = scoredSubmissions.sort((a: any, b: any) => {
      if (b.score !== a.score) return b.score - a.score;
      const aDiff = Math.abs(a.total_score_guess - game.actual_total_score);
      const bDiff = Math.abs(b.total_score_guess - game.actual_total_score);
      return aDiff - bDiff;
    });

    // Top 3 + last place
    const top3 = ranked.slice(0, 3);
    const lastPlace = ranked[ranked.length - 1];
    const winnerSubmissions = [...top3, lastPlace];

    // Calculate base prize amounts
    const pool = Number(game.total_prize_pool);
    const basePrizeAmounts = [
      Math.floor(pool * 100 / 234), // 1st: 10M
      Math.floor(pool * 50 / 234),  // 2nd: 5M
      Math.floor(pool * 42 / 234),  // 3rd: 4.2M
      Math.floor(pool * 42 / 234),  // Last: 4.2M
    ];

    // Check BETR Believer Bonus for each winner
    const bonusResults: { stakedAmount: string; hasBonus: boolean }[] = [];
    for (const s of winnerSubmissions) {
      const stakeResult = await checkUserStakeByFid(s.fid, BONUS_STAKE_THRESHOLD);
      bonusResults.push({
        stakedAmount: stakeResult.stakedAmount,
        hasBonus: stakeResult.meetsRequirement,
      });
    }

    // Final amounts = base + bonus
    const finalAmounts = basePrizeAmounts.map((base, i) =>
      base + (bonusResults[i].hasBonus ? BONUS_AMOUNT : 0)
    );

    // Fetch wallet addresses
    const winnerFids = winnerSubmissions.map((s: any) => s.fid);
    const addressMap = await fetchBulkWalletAddressesForWinners(winnerFids);

    // Fetch existing settlements
    const existingSettlements = await pokerDb.fetch<any>("superbowl_props_settlements", {
      filters: { game_id: gameId },
      limit: 10,
    });
    const settledRanks = new Set((existingSettlements || []).map((s: any) => s.rank));
    const settledTxMap = new Map<number, string>();
    for (const s of existingSettlements || []) {
      settledTxMap.set(s.rank, s.tx_hash || '');
    }

    // ========== PREVIEW MODE ==========
    if (preview) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          preview: true,
          totalPayout: finalAmounts.reduce((a, b) => a + b, 0),
          totalBasePayout: basePrizeAmounts.reduce((a, b) => a + b, 0),
          totalBonusPayout: bonusResults.reduce((sum, b) => sum + (b.hasBonus ? BONUS_AMOUNT : 0), 0),
          winners: winnerSubmissions.map((s: any, i: number) => {
            const rank = i < 3 ? i + 1 : ranked.length;
            return {
              index: i,
              rank,
              label: PRIZE_LABELS[i],
              fid: s.fid,
              username: s.username || null,
              displayName: s.display_name || null,
              pfpUrl: s.pfp_url || null,
              score: s.score,
              walletAddress: selectWalletAddress(addressMap.get(s.fid) || []) || 'unknown',
              baseAmount: basePrizeAmounts[i],
              bonusAmount: bonusResults[i].hasBonus ? BONUS_AMOUNT : 0,
              totalAmount: finalAmounts[i],
              stakedAmount: bonusResults[i].stakedAmount,
              hasBetrBelieverBonus: bonusResults[i].hasBonus,
              alreadyPaid: settledRanks.has(rank),
              txHash: settledTxMap.get(rank) || null,
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

    const winnerSub = winnerSubmissions[payIndex];
    const rank = payIndex < 3 ? payIndex + 1 : ranked.length;

    // Check if this rank is already paid
    if (settledRanks.has(rank)) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: `${PRIZE_LABELS[payIndex]} is already paid`
      }, { status: 400 });
    }

    // Prepare and transfer to this one winner
    const winnerEntry: WinnerEntry = {
      fid: winnerSub.fid,
      amount: finalAmounts[payIndex],
      position: rank,
    };

    const resolved = resolveWinners([winnerEntry], addressMap);
    const txHashes = await transferBETRToWinners(resolved);
    const txHash = txHashes[0] || '';

    // Insert settlement record
    const now = new Date().toISOString();
    const pct = payIndex < 3
      ? [100 / 234 * 100, 50 / 234 * 100, 42 / 234 * 100][payIndex]
      : 42 / 234 * 100;

    await pokerDb.insert("superbowl_props_settlements", [
      {
        game_id: gameId,
        winner_fid: winnerSub.fid,
        rank,
        prize_pct: pct,
        prize_amount: finalAmounts[payIndex],
        tx_hash: txHash,
        settled_at: now,
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: `${PRIZE_LABELS[payIndex]} paid!`,
        label: PRIZE_LABELS[payIndex],
        fid: winnerSub.fid,
        displayName: winnerSub.display_name || null,
        totalAmount: finalAmounts[payIndex],
        baseAmount: basePrizeAmounts[payIndex],
        bonusAmount: bonusResults[payIndex].hasBonus ? BONUS_AMOUNT : 0,
        hasBetrBelieverBonus: bonusResults[payIndex].hasBonus,
        txHash,
        txUrl: `https://basescan.org/tx/${txHash}`,
        paidSoFar: settledRanks.size + 1,
        totalToPay: 4,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-props/games/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle game" }, { status: 500 });
  }
}
