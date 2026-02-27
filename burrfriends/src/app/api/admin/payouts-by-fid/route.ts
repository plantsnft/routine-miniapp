/**
 * GET /api/admin/payouts-by-fid?fid=
 * Admin only. Returns all payouts for a given FID across all game types (for tracking).
 * Each entry includes Basescan tx URL for verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getBaseScanTxUrl } from "~/lib/explorer";
import type { ApiResponse } from "~/lib/types";

type PayoutRow = { source: string; gameIdOrRound: string; amount: number; txHash: string; txUrl: string | null };

export async function GET(req: NextRequest) {
  try {
    const { fid: callerFid } = await requireAuth(req);
    if (!isAdmin(callerFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get("fid");
    const fid = fidParam ? parseInt(fidParam, 10) : NaN;
    if (!fid || isNaN(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Query param fid is required and must be a number" }, { status: 400 });
    }

    const rows: PayoutRow[] = [];

    // buddy_up_settlements: game_id, winner_fid, prize_amount, tx_hash
    try {
      const buddy = await pokerDb.fetch<any>("buddy_up_settlements", { select: "game_id,winner_fid,prize_amount,tx_hash", limit: 500 });
      for (const r of buddy || []) {
        if (Number(r.winner_fid) === fid && r.tx_hash) {
          rows.push({
            source: "buddy_up",
            gameIdOrRound: r.game_id || "",
            amount: parseFloat(String(r.prize_amount || 0)),
            txHash: String(r.tx_hash),
            txUrl: getBaseScanTxUrl(r.tx_hash),
          });
        }
      }
    } catch {
      // non-blocking
    }

    // betr_guesser_settlements: game_id, winner_fid, prize_amount, tx_hash
    try {
      const bg = await pokerDb.fetch<any>("betr_guesser_settlements", { select: "game_id,winner_fid,prize_amount,tx_hash", limit: 500 });
      for (const r of bg || []) {
        if (Number(r.winner_fid) === fid && r.tx_hash) {
          rows.push({
            source: "betr_guesser",
            gameIdOrRound: r.game_id || "",
            amount: parseFloat(String(r.prize_amount || 0)),
            txHash: String(r.tx_hash),
            txUrl: getBaseScanTxUrl(r.tx_hash),
          });
        }
      }
    } catch {
      // non-blocking
    }

    // jenga_settlements: game_id, winner_fid, prize_amount, tx_hash
    try {
      const jg = await pokerDb.fetch<any>("jenga_settlements", { select: "game_id,winner_fid,prize_amount,tx_hash", limit: 500 });
      for (const r of jg || []) {
        if (Number(r.winner_fid) === fid && r.tx_hash) {
          rows.push({
            source: "jenga",
            gameIdOrRound: r.game_id || "",
            amount: parseFloat(String(r.prize_amount || 0)),
            txHash: String(r.tx_hash),
            txUrl: getBaseScanTxUrl(r.tx_hash),
          });
        }
      }
    } catch {
      // non-blocking
    }

    // remix_betr_settlements: round_label, winner_fid, amount, tx_hash (no game_id)
    try {
      const remix = await pokerDb.fetch<any>("remix_betr_settlements", { select: "round_label,winner_fid,amount,tx_hash", limit: 500 });
      for (const r of remix || []) {
        if (Number(r.winner_fid) === fid && r.tx_hash) {
          rows.push({
            source: "remix_betr",
            gameIdOrRound: r.round_label || "round",
            amount: parseFloat(String(r.amount || 0)),
            txHash: String(r.tx_hash),
            txUrl: getBaseScanTxUrl(r.tx_hash),
          });
        }
      }
    } catch {
      // non-blocking
    }

    // burrfriends_participants: game_id, fid, payout_amount, payout_tx_hash (filter in-memory for non-null)
    try {
      const part = await pokerDb.fetch<any>("burrfriends_participants", { select: "game_id,fid,payout_amount,payout_tx_hash", limit: 2000 });
      for (const r of part || []) {
        if (Number(r.fid) === fid && r.payout_tx_hash) {
          rows.push({
            source: "burrfriends_game",
            gameIdOrRound: r.game_id || "",
            amount: parseFloat(String(r.payout_amount || 0)),
            txHash: String(r.payout_tx_hash),
            txUrl: getBaseScanTxUrl(r.payout_tx_hash),
          });
        }
      }
    } catch {
      // non-blocking
    }

    const totalReceived = rows.reduce((s, r) => s + r.amount, 0);

    return NextResponse.json<ApiResponse<{ fid: number; totalReceived: number; count: number; payouts: PayoutRow[] }>>({
      ok: true,
      data: { fid, totalReceived, count: rows.length, payouts: rows },
    });
  } catch (e: any) {
    if (e?.message?.includes("authentication") || e?.message?.includes("token")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 401 });
    }
    console.error("[admin/payouts-by-fid]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: e?.message || "Failed to fetch payouts" }, { status: 500 });
  }
}
