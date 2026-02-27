/**
 * GET /api/steal-no-steal/history - Get past settled games
 */

import { NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET() {
  try {
    // Get settled games
    const games = await pokerDb.fetch<{
      id: string;
      title: string;
      prize_amount: number;
      status: string;
      settled_at: string;
      settle_tx_hash: string | null;
      created_at: string;
    }>("steal_no_steal_games", {
      filters: { status: "settled" },
      order: "settled_at.desc",
      limit: 20,
    });

    // Get settlements for each game
    const gamesWithWinners = [];
    for (const game of games || []) {
      const settlements = await pokerDb.fetch<{
        winner_fid: number;
        prize_amount: number;
        position: number;
        tx_hash: string | null;
      }>("steal_no_steal_settlements", {
        filters: { game_id: game.id },
        order: "position.asc",
        limit: 10,
      });

      // Get winner profiles
      const signups = await pokerDb.fetch<{
        fid: number;
        username: string | null;
        display_name: string | null;
        pfp_url: string | null;
      }>("steal_no_steal_signups", {
        filters: { game_id: game.id },
        limit: 100,
      });

      const profileMap = new Map<number, { username: string | null; display_name: string | null; pfp_url: string | null }>();
      for (const s of signups || []) {
        profileMap.set(Number(s.fid), { username: s.username, display_name: s.display_name, pfp_url: s.pfp_url });
      }

      const winners = (settlements || []).map((s) => ({
        fid: s.winner_fid,
        amount: s.prize_amount,
        position: s.position,
        txHash: s.tx_hash,
        ...profileMap.get(Number(s.winner_fid)),
      }));

      gamesWithWinners.push({
        ...game,
        winners,
      });
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: gamesWithWinners });
  } catch (e: unknown) {
    console.error("[steal-no-steal/history GET]", e);
    const err = e as { message?: string };
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch history" }, { status: 500 });
  }
}
