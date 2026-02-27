/**
 * POST /api/the-mole/games/[id]/settle - Settle game (admin only)
 * Body: { winners: [{ fid: number, amount: number }], confirmWinners: boolean, notes?: string }
 * When status=mole_won: winners must be [{ fid: mole_winner_fid, amount: prize_amount }] (single winner).
 * When status=settled: winners must be from eligible set (advanced from last completed round) and signups.
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

    const games = await pokerDb.fetch<{ id: string; status: string; prize_amount: number; mole_winner_fid?: number | null; community?: string }>("mole_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status === "in_progress" || game.status === "signup" || game.status === "cancelled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game must be mole_won or ended (settled) before settlement" }, { status: 400 });
    }

    const signups = await pokerDb.fetch<{ fid: number }>("mole_signups", {
      filters: { game_id: gameId },
      select: "fid",
      limit: 1000,
    });
    const signupFids = new Set((signups || []).map((s) => Number(s.fid)));

    if (game.status === "mole_won") {
      const moleFid = game.mole_winner_fid != null ? Number(game.mole_winner_fid) : null;
      if (moleFid == null) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Game is mole_won but mole_winner_fid is missing" }, { status: 400 });
      }
      if (!signupFids.has(moleFid)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Mole winner FID ${moleFid} is not a signup for this game.` }, { status: 400 });
      }
      if (winners.length !== 1 || Number(winners[0]?.fid) !== moleFid) {
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: "When the mole won, exactly one winner is required: { fid: mole_winner_fid, amount: prize_amount }",
        }, { status: 400 });
      }
      const amt = typeof winners[0]?.amount === "number" ? winners[0].amount : parseFloat(String(winners[0]?.amount ?? ""));
      if (isNaN(amt) || amt !== Number(game.prize_amount)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Mole must receive the full prize amount" }, { status: 400 });
      }
    } else {
      // status = settled: winners must be from eligible set (advanced from last completed round)
      const completedRounds = await pokerDb.fetch<{ id: string; round_number: number }>("mole_rounds", {
        filters: { game_id: gameId, status: "completed" },
        order: "round_number.desc",
        limit: 1,
      });
      const eligibleFids = new Set<number>();
      if (completedRounds && completedRounds.length > 0) {
        const lastRoundId = completedRounds[0].id;
        const completedGroups = await pokerDb.fetch<{ fids: number[]; mole_fid: number }>("mole_groups", {
          filters: { round_id: lastRoundId, status: "completed" },
          limit: 100,
        });
        for (const g of completedGroups || []) {
          const m = Number(g.mole_fid);
          for (const f of g.fids || []) {
            const n = Number(f);
            if (n !== m) eligibleFids.add(n);
          }
        }
      }
      // If no completed round, allow from signups (admin chose to end before any round or after only mole_won in other rounds)
      if (eligibleFids.size === 0) {
        for (const s of signupFids) eligibleFids.add(s);
      }
      for (const w of winners) {
        const winnerFid = Number(w?.fid);
        if (!signupFids.has(winnerFid)) {
          return NextResponse.json<ApiResponse>({
            ok: false,
            error: `Winner FID ${winnerFid} is not a signup for this game.`,
          }, { status: 400 });
        }
        if (!eligibleFids.has(winnerFid)) {
          return NextResponse.json<ApiResponse>({
            ok: false,
            error: `Winner FID ${winnerFid} is not in the eligible set (advanced from last completed round or signups).`,
          }, { status: 400 });
        }
      }
    }

    const winnerFids = winners.map((w) => Number(w?.fid)).filter((f) => f && !isNaN(f));
    if (winnerFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No valid winner FIDs provided" }, { status: 400 });
    }

    // Phase 36: resolve community config once for wallet ordering + token transfer
    const commCfg = COMMUNITY_CONFIG[(game.community === 'minted_merch' ? 'minted_merch' : 'betr') as keyof typeof COMMUNITY_CONFIG];

    const addressMap = await fetchBulkWalletAddressesForWinners(winnerFids, commCfg.stakingAddress, commCfg.stakingFn);

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

    if (txHashes.length !== resolved.length) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: `Transaction hash count mismatch: expected ${resolved.length}, got ${txHashes.length}. Settlement aborted.`,
      }, { status: 500 });
    }

    const now = new Date().toISOString();
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      await pokerDb.insert("mole_settlements", [
        {
          game_id: gameId,
          winner_fid: r.winnerFid,
          prize_amount: r.amount,
          position: r.position,
          settled_by_fid: fid,
          settled_at: now,
          tx_hash: txHashes[i],
          notes,
        },
      ]);
    }

    await pokerDb.update("mole_games", { id: gameId }, {
      status: "settled",
      settled_by_fid: fid,
      settled_at: now,
      settle_tx_hash: txHashes.join(","),
      updated_at: now,
    });

    // Phase 21: Send winner notifications after settlement (async, non-blocking). Never send for preview games.
    if (!(game as any).is_preview) {
      const gameTitle = (game as any).title || 'THE MOLE';
      after(async () => {
        try {
          const truncatedTitle = gameTitle.length > 20 ? gameTitle.substring(0, 20) + '...' : gameTitle;
          for (const r of resolved) {
            await sendNotificationToFid(
              r.winnerFid,
              {
                title: `${truncatedTitle} - Results`,
                body: `You won ${formatPrizeAmount(r.amount)} BETR! Click here to view the payment details.`,
                targetUrl: `${APP_URL}/the-mole?gameId=${gameId}`,
              },
              `settlement:the_mole:${gameId}:${r.winnerFid}`
            );
          }
          safeLog('info', '[the-mole/settle] Winner notifications sent', { gameId, winnerCount: resolved.length });
        } catch (notifErr) {
          safeLog('error', '[the-mole/settle] Failed to send winner notifications', {
            gameId,
            error: (notifErr as Error)?.message,
          });
        }
      });
    }

    return NextResponse.json<ApiResponse>(createSettlementResponse(txHashes[0] || "", txHashes, resolved));
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[the-mole/games/[id]/settle POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to settle" }, { status: 500 });
  }
}
