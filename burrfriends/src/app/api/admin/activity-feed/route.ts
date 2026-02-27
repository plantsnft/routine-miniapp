/**
 * GET /api/admin/activity-feed
 * Returns recent activity: game creates, signups, settlements
 * 
 * Query params:
 * - limit: number (default 30, max 250)
 * - offset: number (default 0)
 * 
 * Phase 18.1: Admin Dashboard v2
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

interface ActivityEvent {
  type: 'game_created' | 'signup' | 'settlement';
  game_type: string;
  game_id: string;
  fid?: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  prize_amount?: number;
  admin_fid?: number; // Phase 18.2: creator FID for game_created events
  timestamp: string;
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
    const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 250);
    const offset = Number(url.searchParams.get('offset')) || 0;

    const events: ActivityEvent[] = [];

    // Game creations - query all game tables (Phase 18.4: no admin displayed)
    // burrfriends_games uses inserted_at; remix_betr_rounds/weekend_game_rounds are round-based
    const gameTypes: Array<{ table: string; type: string; dateField?: string }> = [
      { table: 'betr_guesser_games', type: 'betr_guesser' },
      { table: 'buddy_up_games', type: 'buddy_up' },
      { table: 'mole_games', type: 'the_mole' },
      { table: 'steal_no_steal_games', type: 'steal_no_steal' },
      { table: 'jenga_games', type: 'jenga' },
      { table: 'superbowl_squares_games', type: 'superbowl_squares' },
      { table: 'burrfriends_games', type: 'poker', dateField: 'inserted_at' },
      { table: 'remix_betr_rounds', type: 'remix_betr' },
      { table: 'bullied_games', type: 'bullied' },
      { table: 'in_or_out_games', type: 'in_or_out' },
      { table: 'take_from_the_pile_games', type: 'take_from_the_pile' },
      { table: 'kill_or_keep_games', type: 'kill_or_keep' },
      { table: 'nl_holdem_games', type: 'nl_holdem' },
      { table: 'art_contest', type: 'art_contest' },
      { table: 'weekend_game_rounds', type: 'weekend_game' },
      { table: 'ncaa_hoops_contests', type: 'ncaa_hoops' },
    ];

    for (const gt of gameTypes) {
      const dateField = gt.dateField || 'created_at';
      const selectCols = `id,${dateField}`;
      try {
        const games = await pokerDb.fetch<{ id: string; created_at?: string; inserted_at?: string }>(gt.table, {
          select: selectCols,
          order: `${dateField}.desc`,
          limit: 50,
        });
        for (const g of games || []) {
          const timestamp = (g as any)[dateField] || g.created_at || g.inserted_at || '';
          if (!timestamp) continue;
          events.push({
            type: 'game_created',
            game_type: gt.type,
            game_id: g.id,
            timestamp,
          });
        }
      } catch (e) {
        // Table might not exist or column mismatch, continue
      }
    }

    // Signups - query signup tables with cached profiles
    const signupTypes = [
      { table: 'buddy_up_signups', type: 'buddy_up' },
      { table: 'mole_signups', type: 'the_mole' },
      { table: 'steal_no_steal_signups', type: 'steal_no_steal' },
      { table: 'jenga_signups', type: 'jenga' },
      { table: 'superbowl_squares_claims', type: 'superbowl_squares', dateField: 'claimed_at' },
    ];

    for (const signupType of signupTypes) {
      const { table, type } = signupType;
      const dateField = (signupType as any).dateField || 'created_at';
      try {
        const signups = await pokerDb.fetch<{
          game_id: string;
          fid: number;
          username?: string;
          display_name?: string;
          pfp_url?: string;
          created_at?: string;
          claimed_at?: string;
        }>(table, {
          select: `game_id,fid,username,display_name,pfp_url,${dateField}`,
          order: `${dateField}.desc`,
          limit: 50,
        });
        for (const s of signups || []) {
          events.push({
            type: 'signup',
            game_type: type,
            game_id: s.game_id,
            fid: s.fid,
            username: s.username || undefined,
            display_name: s.display_name || undefined,
            pfp_url: s.pfp_url || undefined,
            timestamp: (s as any)[dateField] || s.created_at || s.claimed_at || '',
          });
        }
      } catch (e) {
        // Table might not exist, continue
      }
    }

    // Settlements - only include rows with tx_hash (proof of payment, Basescan URL)
    const standardSettlementTables = [
      { table: 'buddy_up_settlements', type: 'buddy_up' },
      { table: 'mole_settlements', type: 'the_mole' },
      { table: 'steal_no_steal_settlements', type: 'steal_no_steal' },
      { table: 'jenga_settlements', type: 'jenga' },
      { table: 'betr_guesser_settlements', type: 'betr_guesser' },
      { table: 'superbowl_squares_settlements', type: 'superbowl_squares' },
      { table: 'superbowl_props_settlements', type: 'superbowl_props' },
    ];

    for (const { table, type } of standardSettlementTables) {
      try {
        const settlements = await pokerDb.fetch<{
          game_id: string;
          prize_amount: number;
          settled_at: string;
          tx_hash?: string | null;
        }>(table, {
          select: "game_id,prize_amount,settled_at,tx_hash",
          order: "settled_at.desc",
          limit: 30,
        });
        for (const s of settlements || []) {
          if (!s.tx_hash) continue; // Only real paid settlements (Basescan URL)
          events.push({
            type: 'settlement',
            game_type: type,
            game_id: s.game_id,
            prize_amount: s.prize_amount ?? 0,
            timestamp: s.settled_at,
          });
        }
      } catch (e) {
        // Table might not exist, continue
      }
    }

    // REMIX BETR - schema: round_label, amount, chosen_at, tx_hash (no game_id)
    try {
      const remixRounds = await pokerDb.fetch<{ id: string; round_label?: string | null }>("remix_betr_rounds", { select: "id,round_label", limit: 500 });
      const roundLabelToId = new Map<string, string>();
      for (const r of remixRounds || []) {
        if (r.round_label) roundLabelToId.set(r.round_label, r.id);
      }
      const remixSettlements = await pokerDb.fetch<{
        round_label?: string | null;
        amount: number;
        chosen_at: string;
        tx_hash?: string | null;
      }>("remix_betr_settlements", {
        select: "round_label,amount,chosen_at,tx_hash",
        order: "chosen_at.desc",
        limit: 60,
      });
      const seenRemix = new Set<string>(); // dedupe by round_label|chosen_at
      for (const s of remixSettlements || []) {
        if (!s.tx_hash) continue;
        const key = `${s.round_label ?? ""}|${s.chosen_at}`;
        if (seenRemix.has(key)) continue;
        seenRemix.add(key);
        const gameId = roundLabelToId.get(s.round_label ?? "") ?? s.round_label ?? "";
        if (gameId) {
          events.push({
            type: 'settlement',
            game_type: 'remix_betr',
            game_id: gameId,
            prize_amount: Number(s.amount) || 0,
            timestamp: s.chosen_at,
          });
        }
      }
    } catch (e) {
      // Table might not exist, continue
    }

    // WEEKEND GAME - schema: round_label, amount, chosen_at, tx_hash (no game_id)
    try {
      const weekendRounds = await pokerDb.fetch<{ id: string; round_label?: string | null }>("weekend_game_rounds", { select: "id,round_label", limit: 500 });
      const roundLabelToId = new Map<string, string>();
      for (const r of weekendRounds || []) {
        if (r.round_label) roundLabelToId.set(r.round_label, r.id);
      }
      const weekendSettlements = await pokerDb.fetch<{
        round_label?: string | null;
        amount: number;
        chosen_at: string;
        tx_hash?: string | null;
      }>("weekend_game_settlements", {
        select: "round_label,amount,chosen_at,tx_hash",
        order: "chosen_at.desc",
        limit: 60,
      });
      const seenWeekend = new Set<string>();
      for (const s of weekendSettlements || []) {
        if (!s.tx_hash) continue;
        const key = `${s.round_label ?? ""}|${s.chosen_at}`;
        if (seenWeekend.has(key)) continue;
        seenWeekend.add(key);
        const gameId = roundLabelToId.get(s.round_label ?? "") ?? s.round_label ?? "";
        if (gameId) {
          events.push({
            type: 'settlement',
            game_type: 'weekend_game',
            game_id: gameId,
            prize_amount: Number(s.amount) || 0,
            timestamp: s.chosen_at,
          });
        }
      }
    } catch (e) {
      // Table might not exist, continue
    }

    // Poker (burrfriends) - from burrfriends_participants where payout_tx_hash set
    try {
      const participants = await pokerDb.fetch<{
        game_id: string;
        payout_amount: number;
        payout_tx_hash: string;
        paid_out_at: string;
      }>("burrfriends_participants", {
        select: "game_id,payout_amount,payout_tx_hash,paid_out_at",
        order: "paid_out_at.desc",
        limit: 100,
      });
      for (const p of participants || []) {
        if (!p.payout_tx_hash || !p.paid_out_at) continue;
        events.push({
          type: 'settlement',
          game_type: 'poker',
          game_id: p.game_id,
          prize_amount: Number(p.payout_amount) || 0,
          timestamp: p.paid_out_at,
        });
      }
    } catch (e) {
      // Table might not exist, continue
    }

    // Sort all events by timestamp DESC
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const paginatedEvents = events.slice(offset, offset + limit);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        events: paginatedEvents,
        total: events.length,
        hasMore: offset + limit < events.length,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/activity-feed]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get activity feed" },
      { status: 500 }
    );
  }
}
