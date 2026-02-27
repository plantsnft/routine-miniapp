/**
 * GET /api/buddy-up/games/[id]/progress - Get full game progress (admin only)
 * Returns signups, all rounds, all groups, all votes
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

    // Get game
    const games = await pokerDb.fetch<any>("buddy_up_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Get signups
    const signups = await pokerDb.fetch<{ fid: number; signed_up_at: string }>("buddy_up_signups", {
      filters: { game_id: gameId },
      order: "signed_up_at.asc",
      limit: 1000,
    });

    // Get all rounds
    const rounds = await pokerDb.fetch<any>("buddy_up_rounds", {
      filters: { game_id: gameId },
      order: "round_number.asc",
      limit: 100,
    });

    // Get all groups for all rounds
    const allGroups: any[] = [];
    const allVotes: any[] = [];

    for (const round of rounds || []) {
      const groups = await pokerDb.fetch<any>("buddy_up_groups", {
        filters: { round_id: round.id },
        order: "group_number.asc",
        limit: 100,
      });

      for (const group of groups || []) {
        allGroups.push({ ...group, round_id: round.id, round_number: round.round_number });

        // Get votes for this group
        const votes = await pokerDb.fetch<any>("buddy_up_votes", {
          filters: { group_id: group.id },
          limit: 100,
        });
        allVotes.push(...(votes || []));
      }
    }

    // Hydrate user profiles
    const allFids = new Set<number>();
    for (const signup of signups || []) {
      allFids.add(Number(signup.fid));
    }
    for (const group of allGroups) {
      for (const fid of group.fids || []) {
        allFids.add(Number(fid));
      }
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
          console.warn("[buddy-up/games/[id]/progress] fetchBulkUsers failed:", e);
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
          username: userMap[Number(s.fid)]?.username || null,
          display_name: userMap[Number(s.fid)]?.display_name || null,
          pfp_url: userMap[Number(s.fid)]?.pfp_url || null,
        })),
        rounds: (rounds || []).map((r) => ({
          ...r,
          groups: allGroups
            .filter((g) => g.round_id === r.id)
            .map((g) => ({
              ...g,
              members: (g.fids || []).map((fid: number) => ({
                fid: Number(fid),
                username: userMap[Number(fid)]?.username || null,
                display_name: userMap[Number(fid)]?.display_name || null,
                pfp_url: userMap[Number(fid)]?.pfp_url || null,
              })),
              votes: allVotes
                .filter((v) => v.group_id === g.id)
                .map((v) => ({
                  voterFid: Number(v.voter_fid),
                  votedForFid: Number(v.voted_for_fid),
                  submitted_at: v.submitted_at,
                })),
            })),
        })),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/progress GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch progress" }, { status: 500 });
  }
}
