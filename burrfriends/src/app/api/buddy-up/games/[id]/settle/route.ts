/**
 * POST /api/buddy-up/games/[id]/settle - Settle game (admin only)
 * Body: { winners: [{ fid: number, amount: number }], confirmWinners: boolean, notes?: string }
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
    const winners: Array<{ fid?: number; amount?: number }> = Array.isArray(body.winners) ? body.winners : [];
    const confirmWinners = body.confirmWinners === true;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (!confirmWinners) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "confirmWinners must be true" }, { status: 400 });
    }

    if (winners.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "At least one winner is required" }, { status: 400 });
    }

    // Check game exists and is settled (ended)
    const games = await pokerDb.fetch<{ id: string; status: string; prize_amount: number; community?: string }>("buddy_up_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // If game is in_progress, end it first (set status to 'settled')
    const now = new Date().toISOString();
    if (game.status === "in_progress") {
      await pokerDb.update("buddy_up_games", { id: gameId }, { status: "settled", updated_at: now });
      // Update local game object for subsequent checks
      game.status = "settled";
    }

    if (game.status !== "settled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game must be in progress or ended before settlement" }, { status: 400 });
    }

    // Phase 5: Eligibility Validation - Verify all winners are signups for this game
    const signups = await pokerDb.fetch<{ fid: number }>("buddy_up_signups", {
      filters: { game_id: gameId },
      select: "fid",
      limit: 1000,
    });
    const signupFids = new Set((signups || []).map((s) => Number(s.fid)));

    // Validate each winner is a signup
    for (const w of winners) {
      const winnerFid = Number(w?.fid);
      if (!signupFids.has(winnerFid)) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: `Winner FID ${winnerFid} is not a signup for this game. Only players who signed up can be winners.`,
          },
          { status: 400 }
        );
      }
    }

    // Phase 2: Use unified settlement library
    const winnerFids = winners.map(w => Number(w?.fid)).filter(fid => fid && !isNaN(fid));
    if (winnerFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No valid winner FIDs provided" }, { status: 400 });
    }

    // Phase 36: resolve community config once for both wallet ordering and token transfer
    const commCfg = COMMUNITY_CONFIG[(game.community === 'minted_merch' ? 'minted_merch' : 'betr') as keyof typeof COMMUNITY_CONFIG];

    // Fetch wallet addresses for all winners (batched), ordered by community staking
    const addressMap = await fetchBulkWalletAddressesForWinners(winnerFids, commCfg.stakingAddress, commCfg.stakingFn);

    // Resolve winners (validate and get addresses)
    let resolved;
    try {
      const winnerEntries: WinnerEntry[] = winners.map((w, i) => ({
        fid: Number(w?.fid),
        amount: typeof w?.amount === "number" ? w.amount : parseFloat(String(w?.amount ?? "")),
        position: i + 1,
      }));
      resolved = resolveWinners(winnerEntries, addressMap);
    } catch (error) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error instanceof Error ? error.message : "Failed to resolve winners" },
        { status: 400 }
      );
    }

    // Transfer tokens to winners — use community-specific token (Phase 36)
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

    // Insert settlement records
    const settledAt = now;
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      await pokerDb.insert("buddy_up_settlements", [
        {
          game_id: gameId,
          winner_fid: r.winnerFid,
          prize_amount: r.amount,
          position: r.position,
          settled_by_fid: fid,
          settled_at: settledAt,
          tx_hash: txHashes[i],
          notes,
        },
      ]);
    }

    // Update game with settlement info
    await pokerDb.update(
      "buddy_up_games",
      { id: gameId },
      {
        settled_by_fid: fid,
        settled_at: settledAt,
        settle_tx_hash: txHashes.join(","), // Store all tx hashes comma-separated
        updated_at: settledAt,
      }
    );

    // Phase 21: Send winner notifications after settlement (async, non-blocking). Never send for preview games.
    if (!(game as any).is_preview) {
      const gameTitle = (game as any).title || 'BUDDY UP';
      after(async () => {
        try {
          const truncatedTitle = gameTitle.length > 20 ? gameTitle.substring(0, 20) + '...' : gameTitle;
          for (const r of resolved) {
            await sendNotificationToFid(
              r.winnerFid,
              {
                title: `${truncatedTitle} - Results`,
                body: `You won ${formatPrizeAmount(r.amount)} BETR! Click here to view the payment details.`,
                targetUrl: `${APP_URL}/buddy-up?gameId=${gameId}`,
              },
              `settlement:buddy_up:${gameId}:${r.winnerFid}`
            );
          }
          safeLog('info', '[buddy-up/settle] Winner notifications sent', { gameId, winnerCount: resolved.length });
        } catch (notifErr) {
          safeLog('error', '[buddy-up/settle] Failed to send winner notifications', {
            gameId,
            error: (notifErr as Error)?.message,
          });
        }
      });
    }

    // Return unified response format with settleTxHash for immediate UI display
    return NextResponse.json<ApiResponse>(
      createSettlementResponse(txHashes[0] || '', txHashes, resolved)
    );
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle" }, { status: 500 });
  }
}
