/**
 * POST /api/steal-no-steal/games/[id]/settle - Settle game (admin only)
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

    if (!confirmWinners) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "confirmWinners must be true" }, { status: 400 });
    }

    if (winners.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "At least one winner is required" }, { status: 400 });
    }

    // Get game
    const games = await pokerDb.fetch<{ id: string; status: string; prize_amount: number; community?: string }>(
      "steal_no_steal_games",
      { filters: { id: gameId }, limit: 1 }
    );

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status === "settled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game already settled" }, { status: 400 });
    }

    if (game.status === "cancelled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Cannot settle cancelled game" }, { status: 400 });
    }

    // Validate winners are signups
    const signups = await pokerDb.fetch<{ fid: number }>("steal_no_steal_signups", {
      filters: { game_id: gameId },
      limit: 100,
    });
    const signupFids = new Set((signups || []).map((s) => Number(s.fid)));

    // Prepare winner FIDs
    const winnerFids = winners.map((w) => Number(w?.fid)).filter((fid) => fid && !isNaN(fid));

    for (const winnerFid of winnerFids) {
      if (!signupFids.has(winnerFid)) {
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: `Winner FID ${winnerFid} is not a signup for this game. Only players who signed up can be winners.`,
        }, { status: 400 });
      }
    }
    if (winnerFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No valid winner FIDs provided" }, { status: 400 });
    }

    const noPayout = body.noPayout === true;
    const now = new Date().toISOString();

    if (noPayout) {
      // Phase 17 special: record winners only, no token transfer, no notifications
      await pokerDb.update("steal_no_steal_games", { id: gameId }, {
        status: "settled",
        settled_by_fid: fid,
        settled_at: now,
        settle_tx_hash: null,
        updated_at: now,
      });
      for (let i = 0; i < winnerFids.length; i++) {
        await pokerDb.insert("steal_no_steal_settlements", [
          {
            game_id: gameId,
            winner_fid: winnerFids[i],
            prize_amount: 0,
            position: i + 1,
            settled_by_fid: fid,
            settled_at: now,
            tx_hash: null,
          },
        ]);
      }
      const noPayoutResolved = winnerFids.map((winnerFid, i) => ({
        winnerFid,
        amount: 0,
        position: i + 1,
        address: "",
      }));
      return NextResponse.json<ApiResponse>(
        createSettlementResponse("", [], noPayoutResolved)
      );
    }

    // Phase 36: resolve community config once for wallet ordering + token transfer
    const commCfg = COMMUNITY_CONFIG[(game.community === 'minted_merch' ? 'minted_merch' : 'betr') as keyof typeof COMMUNITY_CONFIG];

    const addressMap = await fetchBulkWalletAddressesForWinners(winnerFids, commCfg.stakingAddress, commCfg.stakingFn);

    let resolved;
    try {
      const winnerEntries = winners.map((w, i) => ({
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

    let txHashes: string[];
    try {
      txHashes = await transferBETRToWinners(resolved, commCfg.tokenAddress);
    } catch (error) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error instanceof Error ? error.message : "Failed to transfer tokens" },
        { status: 500 }
      );
    }

    await pokerDb.update("steal_no_steal_games", { id: gameId }, {
      status: "settled",
      settled_by_fid: fid,
      settled_at: now,
      settle_tx_hash: txHashes[0],
      updated_at: now,
    });

    for (let i = 0; i < resolved.length; i++) {
      await pokerDb.insert("steal_no_steal_settlements", [
        {
          game_id: gameId,
          winner_fid: resolved[i].winnerFid,
          prize_amount: resolved[i].amount,
          position: resolved[i].position,
          settled_by_fid: fid,
          settled_at: now,
          tx_hash: txHashes[i],
        },
      ]);
    }

    if (!(game as any).is_preview) {
      const gameTitle = (game as any).title || 'STEAL OR NO STEAL';
      const isHeadsUp = gameTitle === 'HEADS UP Steal or No Steal';
      const targetPath = isHeadsUp ? '/heads-up-steal-no-steal' : '/steal-no-steal';
      after(async () => {
        try {
          const truncatedTitle = gameTitle.length > 20 ? gameTitle.substring(0, 20) + '...' : gameTitle;
          for (const r of resolved) {
            await sendNotificationToFid(
              r.winnerFid,
              {
                title: `${truncatedTitle} - Results`,
                body: `You won ${formatPrizeAmount(r.amount)} BETR! Click here to view the payment details.`,
                targetUrl: `${APP_URL}${targetPath}?gameId=${gameId}`,
              },
              `settlement:steal_no_steal:${gameId}:${r.winnerFid}`
            );
          }
          safeLog('info', '[steal-no-steal/settle] Winner notifications sent', { gameId, winnerCount: resolved.length });
        } catch (notifErr) {
          safeLog('error', '[steal-no-steal/settle] Failed to send winner notifications', {
            gameId,
            error: (notifErr as Error)?.message,
          });
        }
      });
    }

    return NextResponse.json<ApiResponse>(
      createSettlementResponse(txHashes[0] || "", txHashes, resolved)
    );
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to settle game" }, { status: 500 });
  }
}
