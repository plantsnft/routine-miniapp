/**
 * GET /api/buddy-up/status - Get user status for active games
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Check registration (Phase 29.1: admins always count as registered)
    const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
      filters: { fid },
      limit: 1,
    });
    const isRegistered = (registered || []).length > 0 || isGlobalAdmin(fid);

    // Get active games
    const activeGames = await pokerDb.fetch<{ id: string; status: string }>("buddy_up_games", {
      filters: { status: "signup" },
      limit: 10,
    });

    const inProgressGames = await pokerDb.fetch<{ id: string; status: string }>("buddy_up_games", {
      filters: { status: "in_progress" },
      limit: 10,
    });

    const allActive = [...(activeGames || []), ...(inProgressGames || [])];

    // Get user's signups
    const signups = await pokerDb.fetch<{ game_id: string }>("buddy_up_signups", {
      filters: { fid },
      limit: 100,
    });

    const signedUpGameIds = new Set((signups || []).map((s) => s.game_id));

    // For in-progress games, get user's group info
    const userStatus = await Promise.all(
      allActive.map(async (game) => {
        const hasSignedUp = signedUpGameIds.has(game.id);
        let myGroupId: string | null = null;
        let myGroupStatus: string | null = null;
        let hasVoted = false;
        let myVote: number | null = null;

        if (game.status === "in_progress" && hasSignedUp) {
          // Try to find user's group
          const rounds = await pokerDb.fetch<{ id: string }>("buddy_up_rounds", {
            filters: { game_id: game.id },
            order: "round_number.desc",
            limit: 1,
          });

          if (rounds && rounds.length > 0) {
            const roundId = rounds[0].id;
            const groups = await pokerDb.fetch<{ id: string; fids: number[]; status: string }>("buddy_up_groups", {
              filters: { round_id: roundId },
              limit: 100,
            });

            const userGroup = (groups || []).find((g) => (g.fids || []).includes(Number(fid)));

            if (userGroup) {
              myGroupId = userGroup.id;
              myGroupStatus = userGroup.status;

              // Check if user voted
              const votes = await pokerDb.fetch<{ voted_for_fid: number }>("buddy_up_votes", {
                filters: { group_id: userGroup.id, voter_fid: fid },
                limit: 1,
              });

              if (votes && votes.length > 0) {
                hasVoted = true;
                myVote = Number(votes[0].voted_for_fid);
              }
            }
          }
        }

        return {
          gameId: game.id,
          gameStatus: game.status,
          hasSignedUp,
          myGroupId,
          myGroupStatus,
          hasVoted,
          myVote,
        };
      })
    );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered: isRegistered,
        activeGames: userStatus,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch status" }, { status: 500 });
  }
}
