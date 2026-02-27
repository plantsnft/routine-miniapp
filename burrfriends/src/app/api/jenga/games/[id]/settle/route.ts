/**
 * GET /api/jenga/games/[id]/settle - Get prefilled settlement data (admin only)
 * POST /api/jenga/games/[id]/settle - Execute settlement (admin only)
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
import { sendNotificationToFid } from "~/lib/notifications";
import { formatPrizeAmount } from "~/lib/format-prize";
import { APP_URL, COMMUNITY_CONFIG } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
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

    // Fetch game
    const games = await pokerDb.fetch<any>("jenga_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    const turnOrder = game.turn_order || [];
    const eliminatedFids = game.eliminated_fids || [];

    // Get eligible players (in turn_order, not eliminated)
    const eligibleFids = turnOrder.filter((fid: number) => !eliminatedFids.includes(fid));

    // Fetch signups with cached profiles
    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("jenga_signups", {
      filters: { game_id: gameId },
      select: "fid,username,display_name,pfp_url",
      limit: 100,
    });

    const eligiblePlayers = eligibleFids
      .map((fid: number) => {
        const signup = (signups || []).find((s) => Number(s.fid) === fid);
        return {
          fid,
          username: signup?.username || null,
          display_name: signup?.display_name || null,
          pfp_url: signup?.pfp_url || null,
        };
      })
      .filter((p: { fid: number }) => p.fid);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        eligiblePlayers,
        game: {
          id: game.id,
          prize_amount: game.prize_amount,
          status: game.status,
        },
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/settle GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch settlement data" }, { status: 500 });
  }
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
    const winnerFid = typeof body.winnerFid === "number" ? body.winnerFid : parseInt(String(body.winnerFid || ""), 10);
    const confirmWinner = body.confirmWinner === true;

    if (!confirmWinner) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Must confirm winner to settle" }, { status: 400 });
    }

    if (isNaN(winnerFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "winnerFid is required" }, { status: 400 });
    }

    // Get game
    const games = await pokerDb.fetch<any>("jenga_games", {
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

    // Validate winner is eligible (in turn_order, not eliminated)
    const turnOrder = game.turn_order || [];
    const eliminatedFids = game.eliminated_fids || [];

    if (!turnOrder.includes(winnerFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Winner is not in the game" }, { status: 400 });
    }

    if (eliminatedFids.includes(winnerFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Winner has been eliminated" }, { status: 400 });
    }

    // If game is in_progress, auto-set status to 'settled' first
    const now = new Date().toISOString();
    if (game.status === "in_progress") {
      await pokerDb.update("jenga_games", { id: gameId }, { status: "settled", updated_at: now });
    }

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
    
    const settleTxHash = txHashes[0];

    // Insert settlement record
    await pokerDb.insert("jenga_settlements", [
      {
        game_id: gameId,
        winner_fid: winnerFid,
        prize_amount: prizeAmount,
        settled_by_fid: fid,
        settled_at: now,
        tx_hash: settleTxHash,
        notes: null,
      },
    ]);

    // Update game
    await pokerDb.update("jenga_games", { id: gameId }, {
      settled_by_fid: fid,
      settled_at: now,
      settle_tx_hash: settleTxHash,
      updated_at: now,
    });

    // Phase 21: Send winner notification after settlement (async, non-blocking). Never send for preview games.
    if (!(game as any).is_preview) {
      const gameTitle = game.title || 'JENGA';
      after(async () => {
        try {
          const truncatedTitle = gameTitle.length > 20 ? gameTitle.substring(0, 20) + '...' : gameTitle;
          await sendNotificationToFid(
            winnerFid,
            {
              title: `${truncatedTitle} - Results`,
              body: `You won ${formatPrizeAmount(prizeAmount)} BETR! Click here to view the payment details.`,
              targetUrl: `${APP_URL}/jenga?gameId=${gameId}`,
            },
            `settlement:jenga:${gameId}:${winnerFid}`
          );
          safeLog('info', '[jenga/settle] Winner notification sent', { gameId, winnerFid });
        } catch (notifErr) {
          safeLog('error', '[jenga/settle] Failed to send winner notification', {
            gameId,
            winnerFid,
            error: (notifErr as Error)?.message,
          });
        }
      });
    }

    // Return unified response format with settleTxHash and transferTxHashes array (Phase 4 complete)
    return NextResponse.json<ApiResponse>(
      createSettlementResponse(settleTxHash, [settleTxHash], resolved, { 
        winnerFid, 
        prizeAmount,
        transferTxHashes: [settleTxHash] // Array format for consistency (even though single winner)
      })
    );
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle" }, { status: 500 });
  }
}
