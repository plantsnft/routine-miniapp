/**
 * GET /api/bullied/games/[id]/my-group - Get user's current group in a BULLIED game
 *
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

    // Fetch game from bullied_games
    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      roulette_wheel_deployed_at: string | null;
    }>(
      "bullied_games",
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
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }

    // Get round (only 1 per game, but fetch latest by round_number desc)
    const rounds = await pokerDb.fetch<{ id: string; status: string; round_number: number; created_at: string }>("bullied_rounds", {
      filters: { game_id: gameId },
      order: "round_number.desc",
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }

    const round = rounds[0];

    // Find group user is in
    const groups = await pokerDb.fetch<{
      id: string;
      group_number: number;
      fids: number[];
      status: string;
      winner_fid: number | null;
      roulette_opted_fids: number[] | null;
      roulette_locked_at: string | null;
    }>("bullied_groups", {
      filters: { round_id: round.id },
      limit: 100,
    });

    const userGroup = (groups || []).find((g) => (g.fids || []).includes(Number(fid)));

    if (!userGroup) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null, roundId: round.id });
    }

    // Get votes for this group (includes reason_text for confessionals)
    const votes = await pokerDb.fetch<{
      voter_fid: number;
      voted_for_fid: number;
      reason_text?: string | null;
    }>("bullied_votes", {
      filters: { group_id: userGroup.id },
      limit: 100,
    });

    // Get user's vote
    const userVote = (votes || []).find((v) => Number(v.voter_fid) === Number(fid));

    // Unread chat count: messages with created_at > COALESCE(last_seen_at, round.created_at)
    const presenceRows = await pokerDb.fetch<{ last_seen_at: string }>("bullied_chat_presence", {
      filters: { fid, group_id: userGroup.id },
      limit: 1,
    });
    const lastSeenAt = presenceRows?.[0]?.last_seen_at ?? null;
    const cutoffMs = lastSeenAt
      ? new Date(lastSeenAt).getTime()
      : new Date(round.created_at).getTime();
    const chatMessages = await pokerDb.fetch<{ created_at: string }>("bullied_chat_messages", {
      filters: { group_id: userGroup.id },
      limit: 100,
    });
    const unreadChatCount = (chatMessages || []).filter(
      (m) => new Date(m.created_at).getTime() > cutoffMs
    ).length;

    // Hydrate user profiles
    const groupFids = (userGroup.fids || []).map((f) => Number(f));
    const userMap: Record<number, CachedProfileData> = {};

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
          console.warn("[bullied/games/[id]/my-group] fetchBulkUsers failed:", e);
        }
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        groupId: userGroup.id,
        groupNumber: userGroup.group_number,
        roundId: round.id,
        roundNumber: round.round_number,
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
        myReason: userVote?.reason_text ?? null,
        voteCount: (votes || []).length,
        totalMembers: groupFids.length,
        votes: (votes || []).map((v) => ({
          voterFid: Number(v.voter_fid),
          votedForFid: Number(v.voted_for_fid),
        })),
        rouletteWheelDeployed: !!game.roulette_wheel_deployed_at,
        rouletteOptedFids: (userGroup.roulette_opted_fids || []).map(Number),
        rouletteLockedAt: userGroup.roulette_locked_at || null,
        unreadChatCount,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[bullied/games/[id]/my-group GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch group" }, { status: 500 });
  }
}
