/**
 * GET /api/admin/settlement-history
 * Returns settlements across all game types with pagination
 * 
 * Query params:
 * - limit: number (default 50)
 * - offset: number (default 0)
 * 
 * Phase 18.4: Added pagination, removed winner profile lookup
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

interface Settlement {
  game_type: string;
  game_id: string;
  prize_amount: number;
  tx_hash: string | null;
  settled_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
    const offset = Number(url.searchParams.get('offset')) || 0;

    const settlements: Settlement[] = [];

    // Standard settlement tables - only include rows with tx_hash (proof of payment, Basescan URL)
    const standardTables = [
      { table: 'buddy_up_settlements', type: 'buddy_up' },
      { table: 'mole_settlements', type: 'the_mole' },
      { table: 'steal_no_steal_settlements', type: 'steal_no_steal' },
      { table: 'jenga_settlements', type: 'jenga' },
      { table: 'betr_guesser_settlements', type: 'betr_guesser' },
      { table: 'superbowl_squares_settlements', type: 'superbowl_squares' },
      { table: 'superbowl_props_settlements', type: 'superbowl_props' },
    ];

    for (const { table, type } of standardTables) {
      try {
        const records = await pokerDb.fetch<{
          game_id: string;
          prize_amount: number;
          tx_hash?: string | null;
          settled_at: string;
        }>(table, {
          select: "game_id,prize_amount,tx_hash,settled_at",
          order: "settled_at.desc",
          limit: 100,
        });
        for (const r of records || []) {
          if (!r.tx_hash) continue;
          settlements.push({
            game_type: type,
            game_id: r.game_id,
            prize_amount: r.prize_amount || 0,
            tx_hash: r.tx_hash,
            settled_at: r.settled_at,
          });
        }
      } catch (e) {
        console.warn(`[admin/settlement-history] Error querying ${table}:`, e);
      }
    }

    // REMIX BETR - schema: round_label, amount, chosen_at, tx_hash (no game_id)
    try {
      const remixRounds = await pokerDb.fetch<{ id: string; round_label?: string | null }>("remix_betr_rounds", { select: "id,round_label", limit: 500 });
      const roundLabelToId = new Map<string, string>();
      for (const r of remixRounds || []) {
        if (r.round_label) roundLabelToId.set(r.round_label, r.id);
      }
      const remixRecords = await pokerDb.fetch<{
        round_label?: string | null;
        amount: number;
        chosen_at: string;
        tx_hash?: string | null;
      }>("remix_betr_settlements", {
        select: "round_label,amount,chosen_at,tx_hash",
        order: "chosen_at.desc",
        limit: 150,
      });
      const seenRemix = new Set<string>();
      for (const r of remixRecords || []) {
        if (!r.tx_hash) continue;
        const key = `${r.round_label ?? ""}|${r.chosen_at}`;
        if (seenRemix.has(key)) continue;
        seenRemix.add(key);
        const gameId = roundLabelToId.get(r.round_label ?? "") ?? r.round_label ?? "";
        if (gameId) {
          settlements.push({
            game_type: 'remix_betr',
            game_id: gameId,
            prize_amount: Number(r.amount) || 0,
            tx_hash: r.tx_hash,
            settled_at: r.chosen_at,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/settlement-history] Error querying remix_betr_settlements:", e);
    }

    // WEEKEND GAME - schema: round_label, amount, chosen_at, tx_hash (no game_id)
    try {
      const weekendRounds = await pokerDb.fetch<{ id: string; round_label?: string | null }>("weekend_game_rounds", { select: "id,round_label", limit: 500 });
      const roundLabelToId = new Map<string, string>();
      for (const r of weekendRounds || []) {
        if (r.round_label) roundLabelToId.set(r.round_label, r.id);
      }
      const weekendRecords = await pokerDb.fetch<{
        round_label?: string | null;
        amount: number;
        chosen_at: string;
        tx_hash?: string | null;
      }>("weekend_game_settlements", {
        select: "round_label,amount,chosen_at,tx_hash",
        order: "chosen_at.desc",
        limit: 150,
      });
      const seenWeekend = new Set<string>();
      for (const r of weekendRecords || []) {
        if (!r.tx_hash) continue;
        const key = `${r.round_label ?? ""}|${r.chosen_at}`;
        if (seenWeekend.has(key)) continue;
        seenWeekend.add(key);
        const gameId = roundLabelToId.get(r.round_label ?? "") ?? r.round_label ?? "";
        if (gameId) {
          settlements.push({
            game_type: 'weekend_game',
            game_id: gameId,
            prize_amount: Number(r.amount) || 0,
            tx_hash: r.tx_hash,
            settled_at: r.chosen_at,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/settlement-history] Error querying weekend_game_settlements:", e);
    }

    // Poker (burrfriends) - from burrfriends_participants where payout_tx_hash set
    try {
      const participants = await pokerDb.fetch<{
        game_id: string;
        payout_amount: number;
        payout_tx_hash: string | null;
        paid_out_at: string | null;
      }>("burrfriends_participants", {
        select: "game_id,payout_amount,payout_tx_hash,paid_out_at",
        order: "paid_out_at.desc",
        limit: 200,
      });
      for (const p of participants || []) {
        if (!p.payout_tx_hash || !p.paid_out_at) continue;
        settlements.push({
          game_type: 'poker',
          game_id: p.game_id,
          prize_amount: Number(p.payout_amount) || 0,
          tx_hash: p.payout_tx_hash,
          settled_at: p.paid_out_at,
        });
      }
    } catch (e) {
      console.warn("[admin/settlement-history] Error querying burrfriends_participants:", e);
    }

    // Sort by settled_at DESC (most recent first)
    settlements.sort((a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime());

    // Apply pagination
    const paginatedSettlements = settlements.slice(offset, offset + limit);
    const hasMore = offset + limit < settlements.length;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { 
        settlements: paginatedSettlements,
        hasMore,
        total: settlements.length,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/settlement-history]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get settlement history" },
      { status: 500 }
    );
  }
}
