/**
 * GET /api/the-mole/history - Get past settled games with winners
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
    const games = await pokerDb.fetch<Record<string, unknown>>("mole_games", {
      filters: { status: "settled" },
      order: "settled_at.desc",
      limit: 50,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    const gameIds = games.map((g) => g.id as string);
    const allSettlements = await pokerDb.fetch<Record<string, unknown>>("mole_settlements", {
      order: "settled_at.desc",
      limit: 1000,
    });

    const settlementsByGame: Record<string, Record<string, unknown>[]> = {};
    for (const s of allSettlements || []) {
      const gid = s.game_id as string;
      if (gameIds.includes(gid)) {
        if (!settlementsByGame[gid]) settlementsByGame[gid] = [];
        settlementsByGame[gid].push(s);
      }
    }

    const allWinnerFids = new Set<number>();
    for (const arr of Object.values(settlementsByGame)) {
      for (const s of arr) allWinnerFids.add(Number(s.winner_fid));
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
            const id = (u as { fid?: number }).fid;
            if (id != null) {
              const profile: CachedProfileData = {
                username: (u as { username?: string }).username,
                display_name: (u as { display_name?: string }).display_name,
                pfp_url: (u as { pfp_url?: string }).pfp_url ?? (u as { pfp?: { url?: string } }).pfp?.url,
              };
              userMap[id] = profile;
              fetched[id] = profile;
            }
          }
          setProfilesInCache(fetched);
        } catch (e) {
          console.warn("[the-mole/history] fetchBulkUsers failed:", e);
        }
      }
    }

    const data = games.map((g) => {
      const settlements = settlementsByGame[g.id as string] || [];
      return {
        id: g.id,
        title: g.title,
        prize_amount: g.prize_amount,
        settled_at: g.settled_at,
        mole_winner_fid: g.mole_winner_fid ?? undefined,
        winners: settlements
          .sort((a, b) => ((a.position as number) || 0) - ((b.position as number) || 0))
          .map((s) => ({
            fid: Number(s.winner_fid),
            prize_amount: s.prize_amount,
            position: s.position,
            username: userMap[Number(s.winner_fid)]?.username ?? null,
            display_name: userMap[Number(s.winner_fid)]?.display_name ?? null,
            pfp_url: userMap[Number(s.winner_fid)]?.pfp_url ?? null,
          })),
      };
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[the-mole/history GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to fetch history" }, { status: 500 });
  }
}
