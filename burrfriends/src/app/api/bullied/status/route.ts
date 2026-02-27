/**
 * GET /api/bullied/status - Get user status for BULLIED games
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Check registration: betr_games_registrations OR isGlobalAdmin
    const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
      filters: { fid },
      limit: 1,
    });
    const isRegistered = (registered || []).length > 0 || isGlobalAdmin(fid);

    // Check if user is alive in tournament
    const alivePlayers = await pokerDb.fetch<{ fid: number; status: string }>("betr_games_tournament_players", {
      filters: { fid, status: "alive" },
      limit: 1,
    });
    const canPlay = (alivePlayers || []).length > 0;

    // Get active games (open + in_progress)
    const openGames = await pokerDb.fetch<{ id: string; status: string }>("bullied_games", {
      filters: { status: "open" },
      limit: 10,
    });

    const inProgressGames = await pokerDb.fetch<{ id: string; status: string }>("bullied_games", {
      filters: { status: "in_progress" },
      limit: 10,
    });

    const allActive = [...(openGames || []), ...(inProgressGames || [])];

    // For in-progress games, find user's group and vote status
    const activeGames = await Promise.all(
      allActive.map(async (game) => {
        let myGroupId: string | null = null;
        let myGroupStatus: string | null = null;
        let hasVoted = false;
        let myVote: number | null = null;

        let unreadChatCount = 0;

        if (game.status === "in_progress") {
          const rounds = await pokerDb.fetch<{ id: string; created_at: string }>("bullied_rounds", {
            filters: { game_id: game.id },
            order: "round_number.desc",
            limit: 1,
          });

          if (rounds && rounds.length > 0) {
            const round = rounds[0];
            const roundId = round.id;
            const groups = await pokerDb.fetch<{ id: string; fids: number[]; status: string }>("bullied_groups", {
              filters: { round_id: roundId },
              limit: 100,
            });

            const userGroup = (groups || []).find((g) => (g.fids || []).includes(Number(fid)));

            if (userGroup) {
              myGroupId = userGroup.id;
              myGroupStatus = userGroup.status;

              const votes = await pokerDb.fetch<{ voted_for_fid: number }>("bullied_votes", {
                filters: { group_id: userGroup.id, voter_fid: fid },
                limit: 1,
              });

              if (votes && votes.length > 0) {
                hasVoted = true;
                myVote = Number(votes[0].voted_for_fid);
              }

              // Unread chat count: messages with created_at > COALESCE(last_seen_at, round.created_at)
              const presenceRows = await pokerDb.fetch<{ last_seen_at: string }>("bullied_chat_presence", {
                filters: { fid, group_id: userGroup.id },
                limit: 1,
              });
              const lastSeenAt = presenceRows?.[0]?.last_seen_at ?? null;
              const cutoffMs = lastSeenAt
                ? new Date(lastSeenAt).getTime()
                : new Date(round.created_at).getTime();

              const messages = await pokerDb.fetch<{ created_at: string }>("bullied_chat_messages", {
                filters: { group_id: userGroup.id },
                limit: 100,
              });
              unreadChatCount = (messages || []).filter(
                (m) => new Date(m.created_at).getTime() > cutoffMs
              ).length;
            } else {
              // Admin (no group): sum unread across all groups for this fid
              for (const group of groups || []) {
                const presenceRows = await pokerDb.fetch<{ last_seen_at: string }>("bullied_chat_presence", {
                  filters: { fid, group_id: group.id },
                  limit: 1,
                });
                const lastSeenAt = presenceRows?.[0]?.last_seen_at ?? null;
                const cutoffMs = lastSeenAt
                  ? new Date(lastSeenAt).getTime()
                  : new Date(round.created_at).getTime();
                const messages = await pokerDb.fetch<{ created_at: string }>("bullied_chat_messages", {
                  filters: { group_id: group.id },
                  limit: 100,
                });
                unreadChatCount += (messages || []).filter(
                  (m) => new Date(m.created_at).getTime() > cutoffMs
                ).length;
              }
            }
          }
        }

        return {
          gameId: game.id,
          gameStatus: game.status,
          myGroupId,
          myGroupStatus,
          hasVoted,
          myVote,
          unreadChatCount,
        };
      })
    );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered: isRegistered,
        canPlay,
        activeGames,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[bullied/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch status" }, { status: 500 });
  }
}
