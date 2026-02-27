/**
 * GET /api/the-mole/games/[id]/progress - Get full game progress (admin only)
 * Includes mole_fid per group for admin verification.
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.5):
 * Uses shared profile cache to reduce Neynar calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    const games = await pokerDb.fetch<Record<string, unknown>>("mole_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    const signups = await pokerDb.fetch<{ fid: number; signed_up_at: string }>("mole_signups", {
      filters: { game_id: gameId },
      order: "signed_up_at.asc",
      limit: 1000,
    });

    const rounds = await pokerDb.fetch<Record<string, unknown>>("mole_rounds", {
      filters: { game_id: gameId },
      order: "round_number.asc",
      limit: 100,
    });

    const allGroups: (Record<string, unknown> & { round_id?: string; round_number?: number })[] = [];
    const allVotes: Record<string, unknown>[] = [];

    for (const round of rounds || []) {
      const groups = await pokerDb.fetch<Record<string, unknown> & { fids?: number[] }>("mole_groups", {
        filters: { round_id: (round as { id?: string }).id as string },
        order: "group_number.asc",
        limit: 100,
      });

      for (const group of groups || []) {
        allGroups.push({ ...group, round_id: (round as { id?: string }).id as string, round_number: (round as { round_number?: number }).round_number as number });

        const votes = await pokerDb.fetch<Record<string, unknown>>("mole_votes", {
          filters: { group_id: group.id as string },
          limit: 100,
        });
        allVotes.push(...(votes || []));
      }
    }

    const allFids = new Set<number>();
    for (const signup of signups || []) allFids.add(Number(signup.fid));
    for (const g of allGroups) {
      const fids = (g as { fids?: unknown }).fids;
      for (const f of Array.isArray(fids) ? fids : []) allFids.add(Number(f));
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
          console.warn("[the-mole/games/[id]/progress] fetchBulkUsers failed:", e);
        }
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        game,
        signups: (signups || []).map((s) => ({
          fid: Number(s.fid),
          signed_up_at: s.signed_up_at,
          username: userMap[Number(s.fid)]?.username ?? null,
          display_name: userMap[Number(s.fid)]?.display_name ?? null,
          pfp_url: userMap[Number(s.fid)]?.pfp_url ?? null,
        })),
        rounds: (rounds || []).map((r) => ({
          ...r,
          groups: allGroups
            .filter((g) => g.round_id === r.id)
            .map((g) => {
              const gFids = Array.isArray((g as Record<string, unknown>).fids) ? (g as { fids: number[] }).fids : [];
              const moleFid = Number((g as { mole_fid?: number }).mole_fid ?? 0);
              return {
              ...g,
              moleFid,
              members: gFids.map((fid: number) => ({
                fid: Number(fid),
                username: userMap[Number(fid)]?.username ?? null,
                display_name: userMap[Number(fid)]?.display_name ?? null,
                pfp_url: userMap[Number(fid)]?.pfp_url ?? null,
              })),
              votes: allVotes
                .filter((v) => v.group_id === g.id)
                .map((v) => ({
                  voterFid: Number((v as { voter_fid?: number }).voter_fid),
                  votedForFid: Number((v as { voted_for_fid?: number }).voted_for_fid),
                  submitted_at: (v as { submitted_at?: string }).submitted_at,
                })),
              };
            }),
        })),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[the-mole/games/[id]/progress GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to fetch progress" }, { status: 500 });
  }
}
