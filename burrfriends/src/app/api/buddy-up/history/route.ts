/**
 * GET /api/buddy-up/history - Get past settled games with winners
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.6):
 * Uses shared profile cache to reduce Neynar calls for winner lookups.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    // Get settled games
    const games = await pokerDb.fetch<any>("buddy_up_games", {
      filters: { status: "settled" },
      order: "settled_at.desc",
      limit: 50,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    // Get settlements for these games
    const gameIds = games.map((g: any) => g.id);
    const allSettlements = await pokerDb.fetch<any>("buddy_up_settlements", {
      order: "settled_at.desc",
      limit: 1000,
    });

    // Group settlements by game
    const settlementsByGame: Record<string, any[]> = {};
    for (const settlement of allSettlements || []) {
      if (gameIds.includes(settlement.game_id)) {
        if (!settlementsByGame[settlement.game_id]) {
          settlementsByGame[settlement.game_id] = [];
        }
        settlementsByGame[settlement.game_id].push(settlement);
      }
    }

    // Hydrate winner profiles
    const allWinnerFids = new Set<number>();
    for (const settlements of Object.values(settlementsByGame)) {
      for (const s of settlements) {
        allWinnerFids.add(Number(s.winner_fid));
      }
    }

    const userMap: Record<number, CachedProfileData> = {};

    // OPTIMIZATION: Check cache first, only fetch missing
    if (allWinnerFids.size > 0) {
      const fidsArray = Array.from(allWinnerFids);
      const { cached, needFetch } = getProfilesFromCache(fidsArray);
      Object.assign(userMap, cached);

      if (needFetch.length > 0) {
        try {
          const client = getNeynarClient();
          const { users } = await client.fetchBulkUsers({ fids: needFetch });
          const fetched: Record<number, CachedProfileData> = {};
          for (const u of users || []) {
            const id = (u as any).fid;
            if (id != null) {
              const profile: CachedProfileData = {
                username: (u as any).username,
                display_name: (u as any).display_name,
                pfp_url: (u as any).pfp_url || (u as any).pfp?.url,
              };
              userMap[id] = profile;
              fetched[id] = profile;
            }
          }
          setProfilesInCache(fetched);
        } catch (e) {
          console.warn("[buddy-up/history] fetchBulkUsers failed:", e);
        }
      }
    }

    // Build response
    const data = games.map((game: any) => {
      const settlements = settlementsByGame[game.id] || [];
      return {
        id: game.id,
        title: game.title,
        prize_amount: game.prize_amount,
        settled_at: game.settled_at,
        winners: settlements
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .map((s: any) => ({
            fid: Number(s.winner_fid),
            prize_amount: s.prize_amount,
            position: s.position,
            username: userMap[Number(s.winner_fid)]?.username || null,
            display_name: userMap[Number(s.winner_fid)]?.display_name || null,
            pfp_url: userMap[Number(s.winner_fid)]?.pfp_url || null,
          })),
      };
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[buddy-up/history GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch history" }, { status: 500 });
  }
}
