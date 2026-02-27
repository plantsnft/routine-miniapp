/**
 * GET /api/the-mole/games/[id]/rounds/[roundId]/groups - Get all groups for a round
 * Admins see mole_fid. Non-admins never see mole_fid. voted_for_fid = who they think is the mole.
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

    const rounds = await pokerDb.fetch<{ id: string; game_id: string }>("mole_rounds", {
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

    const groups = await pokerDb.fetch<{
      id: string;
      group_number: number;
      fids: number[];
      mole_fid: number | null;
      status: string;
    }>("mole_groups", {
      filters: { round_id: roundId },
      order: "group_number.asc",
      limit: 100,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    const groupIds = groups.map((g) => g.id);
    const allVotes = await pokerDb.fetch<{ group_id: string; voter_fid: number; voted_for_fid: number }>("mole_votes", { limit: 1000 });
    const votesByGroup: Record<string, Array<{ voterFid: number; votedForFid: number }>> = {};
    for (const v of allVotes || []) {
      if (groupIds.includes(v.group_id)) {
        if (!votesByGroup[v.group_id]) votesByGroup[v.group_id] = [];
        votesByGroup[v.group_id].push({ voterFid: Number(v.voter_fid), votedForFid: Number(v.voted_for_fid) });
      }
    }

    let userIsAdmin = false;
    try {
      const { fid } = await requireAuth(req);
      userIsAdmin = isAdmin(fid);
    } catch {
      // not authed
    }

    const allFids = new Set<number>();
    for (const g of groups) {
      for (const f of g.fids || []) allFids.add(Number(f));
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
          console.warn("[the-mole/rounds/.../groups] fetchBulkUsers failed:", e);
        }
      }
    }

    const data = groups.map((g) => {
      const votes = votesByGroup[g.id] || [];
      const groupFids = (g.fids || []).map((f) => Number(f));
      const votesToShow = userIsAdmin
        ? votes
        : votes.map((v) => ({ voterFid: v.voterFid, votedForFid: null as number | null }));

      const out: Record<string, unknown> = {
        id: g.id,
        groupNumber: g.group_number,
        fids: groupFids,
        members: groupFids.map((f) => ({
          fid: f,
          username: userMap[f]?.username ?? null,
          display_name: userMap[f]?.display_name ?? null,
          pfp_url: userMap[f]?.pfp_url ?? null,
        })),
        status: g.status,
        votes: votesToShow,
        voteCount: votes.length,
        totalMembers: groupFids.length,
      };
      if (userIsAdmin && g.mole_fid != null) {
        out.moleFid = Number(g.mole_fid);
      }
      return out;
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[the-mole/rounds/.../groups GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to fetch groups" }, { status: 500 });
  }
}
