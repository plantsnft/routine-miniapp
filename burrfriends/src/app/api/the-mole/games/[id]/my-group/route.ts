/**
 * GET /api/the-mole/games/[id]/my-group - Get user's current group (if in active round)
 * NEVER returns mole_fid. voted_for_fid = who they think is the mole.
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

    const games = await pokerDb.fetch<{ id: string; current_round: number; status: string }>("mole_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }

    const rounds = await pokerDb.fetch<{ id: string; status: string }>("mole_rounds", {
      filters: { game_id: gameId, round_number: game.current_round },
      limit: 1,
    });

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }

    const round = rounds[0];

    const groups = await pokerDb.fetch<{
      id: string;
      group_number: number;
      fids: number[];
      mole_fid?: number;
      status: string;
    }>("mole_groups", {
      filters: { round_id: round.id },
      limit: 100,
    });

    const userGroup = (groups || []).find((g) => (g.fids || []).includes(Number(fid)));

    if (!userGroup) {
      return NextResponse.json<ApiResponse>({ ok: true, data: null });
    }

    const moleFid = Number((userGroup as { mole_fid?: number }).mole_fid);
    const youAreTheMole = moleFid !== 0 && moleFid === Number(fid);

    const votes = await pokerDb.fetch<{ voter_fid: number; voted_for_fid: number }>("mole_votes", {
      filters: { group_id: userGroup.id },
      limit: 100,
    });

    const userVote = (votes || []).find((v) => Number(v.voter_fid) === Number(fid));

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
          console.warn("[the-mole/games/[id]/my-group] fetchBulkUsers failed:", e);
        }
      }
    }

    const isRevealPhase = userGroup.status === "completed" || userGroup.status === "mole_won";
    const moleRevealed =
      isRevealPhase && moleFid
        ? {
            fid: moleFid,
            username: userMap[moleFid]?.username ?? null,
            display_name: userMap[moleFid]?.display_name ?? null,
            pfp_url: userMap[moleFid]?.pfp_url ?? null,
          }
        : undefined;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        groupId: userGroup.id,
        groupNumber: userGroup.group_number,
        roundId: round.id,
        roundNumber: game.current_round,
        fids: groupFids,
        members: groupFids.map((f) => ({
          fid: f,
          username: userMap[f]?.username ?? null,
          display_name: userMap[f]?.display_name ?? null,
          pfp_url: userMap[f]?.pfp_url ?? null,
        })),
        status: userGroup.status,
        hasVoted: !!userVote,
        myVote: userVote ? Number(userVote.voted_for_fid) : null,
        voteCount: (votes || []).length,
        totalMembers: groupFids.length,
        votes: (votes || []).map((v) => ({
          voterFid: Number(v.voter_fid),
          votedForFid: Number(v.voted_for_fid),
        })),
        youAreTheMole,
        ...(moleRevealed && { moleRevealed }),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[the-mole/games/[id]/my-group GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to fetch group" }, { status: 500 });
  }
}
