/**
 * GET /api/remix-betr/leaderboard
 * Returns cached leaderboard. If cache is older than 30 min, rebuilds (remix_betr_scores + all approved betr_games_registrations + fetchBulkUsers) then returns.
 * 
 * Phase 12.1: FRAMEDL BETR - sorted ascending (fewer attempts = higher rank)
 * Phase 12.11: All approved BETR Games players included; non-submitters shown as DNP (best_score: null), ranked after 6s.
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
      .fetch<{ id: string; as_of: string; payload: unknown }>("remix_betr_leaderboard_cache", {
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

    // Fetch scores and all registrations in parallel
    const [scores, registrations] = await Promise.all([
      // Phase 12.1: Sort ascending - fewer attempts = higher rank
      pokerDb.fetch<{ fid: number; best_score: number; best_cast_url: string | null }>(
        "remix_betr_scores",
        { select: "fid,best_score,best_cast_url", order: "best_score.asc", limit: 200 }
      ),
      // Phase 12.11: Fetch all registrations to find approved players
      pokerDb.fetch<{ fid: number; approved_at: string | null; rejected_at: string | null }>(
        "betr_games_registrations",
        { select: "fid,approved_at,rejected_at", limit: 200 }
      ),
    ]);

    // Filter approved players (approved_at set, rejected_at not set)
    const approvedFids = new Set(
      (registrations || [])
        .filter((r: any) => r.approved_at && !r.rejected_at)
        .map((r: any) => Number(r.fid))
    );

    // Build scored entries (only approved players who have submitted)
    const scoredFids = new Set<number>();
    const scoredEntries: { fid: number; best_score: number; best_cast_url: string | null }[] = [];
    for (const s of scores || []) {
      const fid = Number(s.fid);
      if (approvedFids.has(fid)) {
        scoredFids.add(fid);
        scoredEntries.push(s);
      }
    }

    // DNP: approved players who have NOT submitted
    const dnpFids: number[] = [];
    for (const fid of approvedFids) {
      if (!scoredFids.has(fid)) {
        dnpFids.push(fid);
      }
    }

    // Hydrate all FIDs (scored + DNP) via fetchBulkUsers
    const allFids = [...scoredEntries.map((s) => Number(s.fid)), ...dnpFids].filter(Boolean);
    const userMap: Record<number, { username?: string; display_name?: string; pfp_url?: string }> = {};
    if (allFids.length > 0) {
      try {
        const client = getNeynarClient();
        const { users } = await client.fetchBulkUsers({ fids: allFids });
        for (const u of users || []) {
          const id = (u as any).fid;
          if (id != null) {
            userMap[id] = {
              username: (u as any).username,
              display_name: (u as any).display_name,
              pfp_url: (u as any).pfp_url || (u as any).pfp?.url,
            };
          }
        }
      } catch (e) {
        console.warn("[remix-betr/leaderboard] fetchBulkUsers failed:", e);
      }
    }

    // Build entries: scored first (ranked 1..N), then DNP (rank: null)
    const entries: {
      rank: number | null;
      fid: number;
      best_score: number | null;
      best_cast_url: string | null;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }[] = [];

    // Scored entries (already sorted ascending by best_score from DB)
    scoredEntries.forEach((s, i) => {
      entries.push({
        rank: i + 1,
        fid: s.fid,
        best_score: s.best_score,
        best_cast_url: s.best_cast_url || null,
        username: userMap[s.fid]?.username ?? null,
        display_name: userMap[s.fid]?.display_name ?? null,
        pfp_url: userMap[s.fid]?.pfp_url ?? null,
      });
    });

    // DNP entries (sorted alphabetically by display_name/username for consistency)
    const dnpEntriesRaw = dnpFids.map((fid) => ({
      fid,
      display_name: userMap[fid]?.display_name ?? null,
      username: userMap[fid]?.username ?? null,
      pfp_url: userMap[fid]?.pfp_url ?? null,
    }));
    dnpEntriesRaw.sort((a, b) => {
      const nameA = (a.display_name || a.username || `FID ${a.fid}`).toLowerCase();
      const nameB = (b.display_name || b.username || `FID ${b.fid}`).toLowerCase();
      return nameA.localeCompare(nameB);
    });
    for (const d of dnpEntriesRaw) {
      entries.push({
        rank: null,
        fid: d.fid,
        best_score: null,
        best_cast_url: null,
        username: d.username,
        display_name: d.display_name,
        pfp_url: d.pfp_url,
      });
    }

    const payload = { entries, generated_at: new Date().toISOString() };
    try {
      await pokerDb.upsert("remix_betr_leaderboard_cache", [{ id: LEADERBOARD_ID, as_of: new Date().toISOString(), payload }]);
    } catch (e) {
      console.warn("[remix-betr/leaderboard] cache upsert failed:", e);
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: entries });
  } catch (e: unknown) {
    console.error("[remix-betr/leaderboard]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: (e as Error)?.message || "Failed to get leaderboard" },
      { status: 500 }
    );
  }
}
