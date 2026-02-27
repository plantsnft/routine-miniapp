/**
 * GET /api/buddy-up/games/[id]/rounds/[roundId]/groups - Get all groups for a round
 * Users see all groups (but not votes). Admins see all groups + votes.
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.5):
 * Uses shared profile cache to reduce Neynar calls for group member lookups.
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
  { params }: { params: Promise<{ id: string; roundId: string }> }
) {
  try {
    const { id: gameId, roundId } = await params;

    // Check round exists
    const rounds = await pokerDb.fetch<{ id: string; game_id: string }>("buddy_up_rounds", {
      filters: { id: roundId },
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }

    const round = rounds[0];
    if (round.game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round does not belong to this game" }, { status: 400 });
    }

    // Get all groups for this round
    const groups = await pokerDb.fetch<{
      id: string;
      group_number: number;
      fids: number[];
      status: string;
      winner_fid: number | null;
    }>("buddy_up_groups", {
      filters: { round_id: roundId },
      order: "group_number.asc",
      limit: 100,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    // Get all votes for these groups
    const groupIds = groups.map((g) => g.id);
    const allVotes = await pokerDb.fetch<{
      group_id: string;
      voter_fid: number;
      voted_for_fid: number;
    }>("buddy_up_votes", {
      limit: 1000,
    });

    // Filter votes for these groups
    const votesByGroup: Record<string, Array<{ voterFid: number; votedForFid: number }>> = {};
    for (const vote of allVotes || []) {
      if (groupIds.includes(vote.group_id)) {
        if (!votesByGroup[vote.group_id]) {
          votesByGroup[vote.group_id] = [];
        }
        votesByGroup[vote.group_id].push({
          voterFid: Number(vote.voter_fid),
          votedForFid: Number(vote.voted_for_fid),
        });
      }
    }

    // Check if user is admin
    let userIsAdmin = false;
    try {
      const { fid } = await requireAuth(req);
      userIsAdmin = isAdmin(fid);
    } catch {
      // Not authed, not admin
    }

    // Hydrate user profiles
    const allFids = new Set<number>();
    for (const group of groups) {
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
          console.warn("[buddy-up/games/[id]/rounds/[roundId]/groups] fetchBulkUsers failed:", e);
        }
      }
    }

    // Build response
    const data = groups.map((group) => {
      const votes = votesByGroup[group.id] || [];
      const groupFids = (group.fids || []).map((f) => Number(f));

      // For non-admins, don't show individual votes
      const votesToShow = userIsAdmin
        ? votes
        : votes.map((v) => ({ voterFid: v.voterFid, votedForFid: null })); // Hide voted_for_fid for non-admins

      return {
        id: group.id,
        groupNumber: group.group_number,
        fids: groupFids,
        members: groupFids.map((fid) => ({
          fid,
          username: userMap[fid]?.username || null,
          display_name: userMap[fid]?.display_name || null,
          pfp_url: userMap[fid]?.pfp_url || null,
        })),
        status: group.status,
        winnerFid: group.winner_fid ? Number(group.winner_fid) : null,
        votes: votesToShow,
        voteCount: votes.length,
        totalMembers: groupFids.length,
      };
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[buddy-up/games/[id]/rounds/[roundId]/groups GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch groups" }, { status: 500 });
  }
}
