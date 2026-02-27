/**
 * GET /api/buddy-up/games/[id]/my-group - Get user's current group (if in active round)
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.5):
 * Uses shared profile cache to reduce Neynar calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
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
    const { id: gameId } = await params;

    // Get current round
    const games = await pokerDb.fetch<{ id: string; current_round: number; status: string }>(
      "buddy_up_games",
      {
        filters: { id: gameId },
        limit: 1,
      }
    );

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: true, data: null }); // No active round
    }

    // Get current round
    const rounds = await pokerDb.fetch<{ id: string; status: string }>("buddy_up_rounds", {
      filters: { game_id: gameId, round_number: game.current_round },
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null }); // No round created yet
    }

    const round = rounds[0];

    // Find group user is in
    const groups = await pokerDb.fetch<{
      id: string;
      group_number: number;
      fids: number[];
      status: string;
      winner_fid: number | null;
    }>("buddy_up_groups", {
      filters: { round_id: round.id },
      limit: 100,
    });

    const userGroup = (groups || []).find((g) => (g.fids || []).includes(Number(fid)));

    if (!userGroup) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null }); // User not in any group
    }

    // Get votes for this group
    const votes = await pokerDb.fetch<{
      voter_fid: number;
      voted_for_fid: number;
    }>("buddy_up_votes", {
      filters: { group_id: userGroup.id },
      limit: 100,
    });

    // Get user's vote
    const userVote = (votes || []).find((v) => Number(v.voter_fid) === Number(fid));

    // Hydrate user profiles
    const groupFids = (userGroup.fids || []).map((f) => Number(f));
    const userMap: Record<number, CachedProfileData> = {};

    // OPTIMIZATION: Check cache first, only fetch missing
    if (groupFids.length > 0) {
      const { cached, needFetch } = getProfilesFromCache(groupFids);
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
          console.warn("[buddy-up/games/[id]/my-group] fetchBulkUsers failed:", e);
        }
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        groupId: userGroup.id,
        groupNumber: userGroup.group_number,
        roundId: round.id,
        roundNumber: game.current_round,
        fids: groupFids,
        members: groupFids.map((fid) => ({
          fid,
          username: userMap[fid]?.username || null,
          display_name: userMap[fid]?.display_name || null,
          pfp_url: userMap[fid]?.pfp_url || null,
        })),
        status: userGroup.status,
        winnerFid: userGroup.winner_fid ? Number(userGroup.winner_fid) : null,
        hasVoted: !!userVote,
        myVote: userVote ? Number(userVote.voted_for_fid) : null,
        voteCount: (votes || []).length,
        totalMembers: groupFids.length,
        votes: (votes || []).map((v) => ({
          voterFid: Number(v.voter_fid),
          votedForFid: Number(v.voted_for_fid), // User can see votes in their own group
        })),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/my-group GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch group" }, { status: 500 });
  }
}
