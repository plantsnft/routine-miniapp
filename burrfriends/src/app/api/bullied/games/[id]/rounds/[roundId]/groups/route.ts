/**
 * GET /api/bullied/games/[id]/rounds/[roundId]/groups - Get all groups for a round with voting progress
 *
 * Users see all groups but not individual votes. Admins see all groups + votes.
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
  { params }: { params: Promise<{ id: string; roundId: string }> }
) {
  try {
    const { id: gameId, roundId } = await params;

    // Check round exists
    const rounds = await pokerDb.fetch<{ id: string; game_id: string; created_at: string }>("bullied_rounds", {
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
      roulette_opted_fids: number[] | null;
      roulette_locked_at: string | null;
    }>("bullied_groups", {
      filters: { round_id: roundId },
      order: "group_number.asc",
      limit: 100,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    // Get all votes, filter by group IDs (no select = all columns: reason_text, updated_at for confessionals)
    const groupIds = groups.map((g) => g.id);
    const allVotes = await pokerDb.fetch<{
      group_id: string;
      voter_fid: number;
      voted_for_fid: number;
      reason_text?: string | null;
      updated_at?: string;
    }>("bullied_votes", {
      limit: 1000,
    });

    const votesByGroup: Record<string, Array<{ voterFid: number; votedForFid: number; reasonText: string | null; updatedAt: string }>> = {};
    for (const vote of allVotes || []) {
      if (groupIds.includes(vote.group_id)) {
        if (!votesByGroup[vote.group_id]) {
          votesByGroup[vote.group_id] = [];
        }
        votesByGroup[vote.group_id].push({
          voterFid: Number(vote.voter_fid),
          votedForFid: Number(vote.voted_for_fid),
          reasonText: vote.reason_text ?? null,
          updatedAt: vote.updated_at ?? "",
        });
      }
    }

    // Check if user is admin and capture fid for admin unread count
    let viewerFid: number | null = null;
    let userIsAdmin = false;
    try {
      const auth = await requireAuth(req);
      viewerFid = auth.fid;
      userIsAdmin = isAdmin(auth.fid);
    } catch {
      // Not authed, not admin
    }

    // When admin: get message count per group, active presence count (last 60s) per group, and unread per group for this viewer
    const messageCountByGroup: Record<string, number> = {};
    const activeCountByGroup: Record<string, number> = {};
    const unreadChatCountByGroup: Record<string, number> = {};
    if (userIsAdmin) {
      for (const g of groups) {
        const msgs = await pokerDb.fetch<{ id: string }>("bullied_chat_messages", {
          filters: { group_id: g.id },
          limit: 5000,
        });
        messageCountByGroup[g.id] = (msgs || []).length;
      }
      const presenceRows = await pokerDb.fetch<{ group_id: string; last_seen_at: string }>(
        "bullied_chat_presence",
        { limit: 2000 }
      );
      const cutoff = new Date(Date.now() - 60 * 1000);
      for (const row of presenceRows || []) {
        if (!groupIds.includes(row.group_id)) continue;
        if (new Date(row.last_seen_at) <= cutoff) continue;
        activeCountByGroup[row.group_id] = (activeCountByGroup[row.group_id] ?? 0) + 1;
      }
      if (viewerFid != null) {
        const roundCreatedAtMs = new Date(round.created_at).getTime();
        for (const g of groups) {
          const presenceRowsForGroup = await pokerDb.fetch<{ last_seen_at: string }>("bullied_chat_presence", {
            filters: { fid: viewerFid, group_id: g.id },
            limit: 1,
          });
          const lastSeenAt = presenceRowsForGroup?.[0]?.last_seen_at ?? null;
          const cutoffMs = lastSeenAt ? new Date(lastSeenAt).getTime() : roundCreatedAtMs;
          const chatMessages = await pokerDb.fetch<{ created_at: string }>("bullied_chat_messages", {
            filters: { group_id: g.id },
            limit: 100,
          });
          unreadChatCountByGroup[g.id] = (chatMessages || []).filter(
            (m) => new Date(m.created_at).getTime() > cutoffMs
          ).length;
        }
      }
    }

    // Hydrate user profiles
    const allFids = new Set<number>();
    for (const group of groups) {
      for (const fid of group.fids || []) {
        allFids.add(Number(fid));
      }
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
          console.warn("[bullied/games/[id]/rounds/[roundId]/groups] fetchBulkUsers failed:", e);
        }
      }
    }

    // Build response
    const data = groups.map((group) => {
      const votes = votesByGroup[group.id] || [];
      const groupFids = (group.fids || []).map((f) => Number(f));

      const votesToShow = userIsAdmin
        ? votes
        : votes.map((v) => ({ voterFid: v.voterFid, votedForFid: null }));

      const out: Record<string, unknown> = {
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
        rouletteOptedFids: (group.roulette_opted_fids || []).map(Number),
        rouletteLockedAt: group.roulette_locked_at || null,
      };
      if (userIsAdmin) {
        out.messageCount = messageCountByGroup[group.id] ?? 0;
        out.activeCount = activeCountByGroup[group.id] ?? 0;
        out.unreadChatCount = unreadChatCountByGroup[group.id] ?? 0;
      }
      return out;
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[bullied/games/[id]/rounds/[roundId]/groups GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch groups" }, { status: 500 });
  }
}
