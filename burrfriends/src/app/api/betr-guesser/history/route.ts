/**
 * GET /api/betr-guesser/history - Past settled games with winners
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
    const settlements = await pokerDb.fetch<{
      id: string;
      game_id: string;
      winner_fid: number;
      winner_guess: number;
      prize_amount: number;
      settled_at: string;
      tx_hash: string | null;
    }>("betr_guesser_settlements", {
      select: "id,game_id,winner_fid,winner_guess,prize_amount,settled_at,tx_hash",
      order: "settled_at.desc",
      limit: 100,
    });

    const allFids = new Set<number>();
    for (const s of settlements || []) {
      allFids.add(Number(s.winner_fid));
    }

    const userMap: Record<number, CachedProfileData> = {};
    
    // OPTIMIZATION: Check cache first, only fetch missing
    if (allFids.size > 0) {
      const fidsArray = Array.from(allFids);
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
              const profile: CachedProfileData = { username: (u as any).username, display_name: (u as any).display_name, pfp_url: (u as any).pfp_url || (u as any).pfp?.url };
              userMap[id] = profile;
              fetched[id] = profile;
            }
          }
          setProfilesInCache(fetched);
        } catch (e) {
          console.warn("[betr-guesser/history] fetchBulkUsers failed:", e);
        }
      }
    }

    const games = settlements?.map((s) => ({
      gameId: s.game_id,
      winnerFid: s.winner_fid,
      winnerGuess: s.winner_guess,
      prizeAmount: Number(s.prize_amount),
      settledAt: s.settled_at,
      txHash: s.tx_hash || undefined,
      winner: userMap[s.winner_fid] || {},
    })) || [];

    return NextResponse.json<ApiResponse>({ ok: true, data: games });
  } catch (e: unknown) {
    console.error("[betr-guesser/history]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: (e as Error)?.message || "Failed to get history" }, { status: 500 });
  }
}
