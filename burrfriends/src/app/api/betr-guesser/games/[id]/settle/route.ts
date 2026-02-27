/**
 * POST /api/betr-guesser/games/[id]/settle - Settle game (admin only)
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import {
  fetchBulkWalletAddressesForWinners,
  resolveWinners,
  transferBETRToWinners,
  createSettlementResponse,
  type WinnerEntry,
} from "~/lib/settlement-core";
import { calculateBetrGuesserWinner } from "~/lib/betrGuesserWinner";
import { sendNotificationToFid } from "~/lib/notifications";
import { formatPrizeAmount } from "~/lib/format-prize";
import { APP_URL, COMMUNITY_CONFIG } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

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
    const confirmWinner = body.confirmWinner === true;

    if (!confirmWinner) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Must confirm winner to settle" }, { status: 400 });
    }

    // Get game
    const games = await pokerDb.fetch<any & { community?: string }>("betr_guesser_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status === "settled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game already settled" }, { status: 400 });
    }

    if (game.status !== "closed" && game.status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game must be closed to settle" }, { status: 400 });
    }

    // Calculate winner using shared function (same logic as calculate-winner endpoint)
    const winnerResult = await calculateBetrGuesserWinner(gameId);

    if (!winnerResult) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No winner found (no unique guesses)" }, { status: 400 });
    }

    const { winnerFid, winnerGuess } = winnerResult;

    // Phase 2: Use unified settlement library (single winner, but uses library for consistency)
    const prizeAmount = parseFloat(String(game.prize_amount));
    const winnerEntries: WinnerEntry[] = [{ fid: winnerFid, amount: prizeAmount }];
    
    // Phase 36: resolve community config once for wallet ordering + token transfer
    const commCfg = COMMUNITY_CONFIG[(game.community === 'minted_merch' ? 'minted_merch' : 'betr') as keyof typeof COMMUNITY_CONFIG];

    // Fetch wallet addresses (batched, but only 1 winner), ordered by community staking
    const addressMap = await fetchBulkWalletAddressesForWinners([winnerFid], commCfg.stakingAddress, commCfg.stakingFn);
    
    // Resolve winner
    let resolved;
    try {
      resolved = resolveWinners(winnerEntries, addressMap);
    } catch (error) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error instanceof Error ? error.message : "Failed to resolve winner" },
        { status: 400 }
      );
    }

    // Transfer tokens — use community-specific token (Phase 36)
    let txHashes: string[];
    try {
      txHashes = await transferBETRToWinners(resolved, commCfg.tokenAddress);
    } catch (error) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error instanceof Error ? error.message : "Failed to transfer tokens" },
        { status: 500 }
      );
    }

    // Validate transaction hash count matches resolved winners (safety check)
    if (txHashes.length !== resolved.length) {
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: `Transaction hash count mismatch: expected ${resolved.length}, got ${txHashes.length}. Settlement aborted to prevent data corruption.` 
        },
        { status: 500 }
      );
    }
    
    const txHash = txHashes[0];

    const now = new Date().toISOString();

    // Update game
    await pokerDb.update("betr_guesser_games", { id: gameId }, {
      status: "settled",
      winner_fid: winnerFid,
      winner_guess: winnerGuess,
      settled_by_fid: fid,
      settled_at: now,
      settle_tx_hash: txHash,
      updated_at: now,
    });

    // Insert settlement record
    await pokerDb.insert("betr_guesser_settlements", [
      {
        game_id: gameId,
        winner_fid: winnerFid,
        winner_guess: winnerGuess,
        prize_amount: prizeAmount,
        settled_by_fid: fid,
        settled_at: now,
        tx_hash: txHash,
        notes: null,
      },
    ]);

    // Phase 21: Send winner notification after settlement (async, non-blocking). Never send for preview games.
    if (!(game as any).is_preview) {
      const gameTitle = game.title || 'BETR GUESSER';
      after(async () => {
        try {
          const truncatedTitle = gameTitle.length > 20 ? gameTitle.substring(0, 20) + '...' : gameTitle;
          await sendNotificationToFid(
            winnerFid,
            {
              title: `${truncatedTitle} - Results`,
              body: `You won ${formatPrizeAmount(prizeAmount)} BETR! Click here to view the payment details.`,
              targetUrl: `${APP_URL}/betr-guesser?gameId=${gameId}`,
            },
            `settlement:betr_guesser:${gameId}:${winnerFid}`
          );
          safeLog('info', '[betr-guesser/settle] Winner notification sent', { gameId, winnerFid });
        } catch (notifErr) {
          safeLog('error', '[betr-guesser/settle] Failed to send winner notification', {
            gameId,
            winnerFid,
            error: (notifErr as Error)?.message,
          });
        }
      });
    }

    // Return unified response format
    return NextResponse.json<ApiResponse>(
      createSettlementResponse(txHash, [txHash], resolved, { winnerFid, winnerGuess })
    );
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle" }, { status: 500 });
  }
}
