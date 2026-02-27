/**
 * GET /api/bullied/history - Get past settled BULLIED games with winners
 *
 * No settlements table — winners come from bullied_groups with status 'completed' and winner_fid set.
 * Uses shared profile cache to reduce Neynar calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    // Get settled games
    const games = await pokerDb.fetch<{
      id: string;
      title: string;
      status: string;
      updated_at: string;
    }>("bullied_games", {
      filters: { status: "settled" },
      order: "updated_at.desc",
      limit: 50,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    // For each game, fetch round and completed groups with winners
    const allWinnerFids = new Set<number>();
    const winnersByGame: Record<string, number[]> = {};

    for (const game of games) {
      const rounds = await pokerDb.fetch<{ id: string }>("bullied_rounds", {
        filters: { game_id: game.id },
        limit: 1,
      });

      if (!rounds || rounds.length === 0) {
        winnersByGame[game.id] = [];
        continue;
      }

      const roundId = rounds[0].id;
      const completedGroups = await pokerDb.fetch<{
        id: string;
        status: string;
        winner_fid: number | null;
      }>("bullied_groups", {
        filters: { round_id: roundId, status: "completed" },
        limit: 100,
      });

      const winners: number[] = [];
      for (const group of completedGroups || []) {
        if (group.winner_fid != null) {
          const winnerFid = Number(group.winner_fid);
          winners.push(winnerFid);
          allWinnerFids.add(winnerFid);
        }
      }
      winnersByGame[game.id] = winners;
    }

    // Hydrate winner profiles
    const userMap: Record<number, CachedProfileData> = {};

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
          console.warn("[bullied/history] fetchBulkUsers failed:", e);
        }
      }
    }

    // Build response
    const data = games.map((game) => ({
      id: game.id,
      title: game.title,
      settled_at: game.updated_at,
      winners: (winnersByGame[game.id] || []).map((winnerFid) => ({
        fid: winnerFid,
        username: userMap[winnerFid]?.username || null,
        display_name: userMap[winnerFid]?.display_name || null,
        pfp_url: userMap[winnerFid]?.pfp_url || null,
      })),
    }));

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[bullied/history GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch history" }, { status: 500 });
  }
}
