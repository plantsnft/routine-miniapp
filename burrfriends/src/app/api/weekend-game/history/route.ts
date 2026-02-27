/**
 * GET /api/weekend-game/history
 * Past rounds from weekend_game_settlements, grouped by round, 5 winners per round, hydrated.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import type { ApiResponse } from "~/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const rows = await pokerDb.fetch<{
      id: string;
      round_label: string | null;
      winner_fid: number;
      amount: number;
      position: number;
      chosen_at: string;
      tx_hash: string | null;
    }>("weekend_game_settlements", {
      select: "id,round_label,winner_fid,amount,position,chosen_at,tx_hash",
      order: "chosen_at.desc",
      limit: 500,
    });

    const byRound = new Map<string, typeof rows>();
    for (const r of rows || []) {
      const key = `${r.round_label ?? "Round"}|${r.chosen_at}`;
      if (!byRound.has(key)) byRound.set(key, []);
      byRound.get(key)!.push(r);
    }

    const rounds: {
      round_label: string | null;
      chosen_at: string;
      winners: {
        fid: number;
        amount: number;
        position: number;
        username?: string;
        display_name?: string;
        pfp_url?: string;
        tx_hash?: string | null;
      }[];
    }[] = [];
    const allFids = new Set<number>();
    for (const [, grp] of byRound) {
      const chosen_at = grp[0]?.chosen_at ?? "";
      const round_label = grp[0]?.round_label ?? null;
      const winners = grp
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map((w) => {
          allFids.add(Number(w.winner_fid));
          return {
            fid: w.winner_fid,
            amount: Number(w.amount),
            position: w.position,
            tx_hash: w.tx_hash ?? undefined,
          };
        });
      rounds.push({ round_label, chosen_at, winners });
    }

    const userMap: Record<number, CachedProfileData> = {};
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
            const id = (u as { fid?: number }).fid;
            if (id != null) {
              const profile: CachedProfileData = {
                username: (u as { username?: string }).username,
                display_name: (u as { display_name?: string }).display_name,
                pfp_url: (u as { pfp_url?: string; pfp?: { url?: string } }).pfp_url || (u as { pfp?: { url?: string } }).pfp?.url,
              };
              userMap[id] = profile;
              fetched[id] = profile;
            }
          }
          setProfilesInCache(fetched);
        } catch (e) {
          console.warn("[weekend-game/history] fetchBulkUsers failed:", e);
        }
      }
    }

    for (const r of rounds) {
      for (const w of r.winners) {
        Object.assign(w, userMap[w.fid] || {});
      }
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: rounds });
  } catch (e: unknown) {
    console.error("[weekend-game/history]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: (e as Error)?.message || "Failed to get history" },
      { status: 500 }
    );
  }
}
