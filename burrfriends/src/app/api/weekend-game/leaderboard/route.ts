/**
 * GET /api/weekend-game/leaderboard
 * Returns cached leaderboard. If cache older than 30 min, rebuilds (weekend_game_scores ORDER BY best_score DESC).
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

const CACHE_TTL_MS = 30 * 60 * 1000;
const LEADERBOARD_ID = "default";

export async function GET(_req: NextRequest) {
  try {
    const cached = await pokerDb
      .fetch<{ id: string; as_of: string; payload: unknown }>("weekend_game_leaderboard_cache", {
        filters: { id: LEADERBOARD_ID },
        limit: 1,
      })
      .catch(() => []);

    const row = cached?.[0];
    const asOf = row?.as_of ? new Date(row.as_of).getTime() : 0;
    const now = Date.now();
    const stale = !asOf || now - asOf > CACHE_TTL_MS;

    if (!stale && row?.payload) {
      const p = row.payload as { entries?: unknown[] };
      return NextResponse.json<ApiResponse>({ ok: true, data: p.entries ?? [] });
    }

    const scores = await pokerDb.fetch<{ fid: number; best_score: number; best_cast_url: string | null }>(
      "weekend_game_scores",
      { select: "fid,best_score,best_cast_url", order: "best_score.desc", limit: 150 }
    );

    const fids = (scores || []).map((s: { fid: number }) => Number(s.fid)).filter(Boolean);
    const userMap: Record<number, { username?: string; display_name?: string; pfp_url?: string }> = {};
    if (fids.length > 0) {
      try {
        const client = getNeynarClient();
        const { users } = await client.fetchBulkUsers({ fids });
        for (const u of users || []) {
          const id = (u as { fid?: number }).fid;
          if (id != null) {
            userMap[id] = {
              username: (u as { username?: string }).username,
              display_name: (u as { display_name?: string }).display_name,
              pfp_url: (u as { pfp_url?: string; pfp?: { url?: string } }).pfp_url || (u as { pfp?: { url?: string } }).pfp?.url,
            };
          }
        }
      } catch (e) {
        console.warn("[weekend-game/leaderboard] fetchBulkUsers failed:", e);
      }
    }

    const entries = (scores || []).map((s: { fid: number; best_score: number; best_cast_url: string | null }, i: number) => ({
      rank: i + 1,
      fid: s.fid,
      best_score: s.best_score,
      best_cast_url: s.best_cast_url || null,
      username: userMap[s.fid]?.username ?? null,
      display_name: userMap[s.fid]?.display_name ?? null,
      pfp_url: userMap[s.fid]?.pfp_url ?? null,
    }));

    const payload = { entries, generated_at: new Date().toISOString() };
    try {
      await pokerDb.upsert("weekend_game_leaderboard_cache", [{ id: LEADERBOARD_ID, as_of: new Date().toISOString(), payload }]);
    } catch (e) {
      console.warn("[weekend-game/leaderboard] cache upsert failed:", e);
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: entries });
  } catch (e: unknown) {
    console.error("[weekend-game/leaderboard]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: (e as Error)?.message || "Failed to get leaderboard" },
      { status: 500 }
    );
  }
}
