/**
 * POST /api/buddy-up/games/[id]/rounds - Create new round (admin only)
 * Body: { groupSize: number, customGroups?: [{ groupNumber: number, fids: number[] }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

// Shuffle array (Fisher-Yates)
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;
    const body = await req.json().catch(() => ({}));
    const groupSize = typeof body.groupSize === "number" ? body.groupSize : parseInt(String(body.groupSize || ""), 10);
    const customGroups = Array.isArray(body.customGroups) ? body.customGroups : undefined;

    if (isNaN(groupSize) || groupSize < 1 || groupSize > 10) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "groupSize must be between 1 and 10" }, { status: 400 });
    }

    // Check game exists and is in_progress
    const games = await pokerDb.fetch<{ id: string; status: string; current_round: number }>(
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
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    // Check if round already exists for current_round
    const existingRound = await pokerDb.fetch<{ id: string }>("buddy_up_rounds", {
      filters: { game_id: gameId, round_number: game.current_round },
      limit: 1,
    });

    if (existingRound && existingRound.length > 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: `Round ${game.current_round} already exists. Complete it before creating the next round.` }, { status: 400 });
    }

    // Get eligible players (signups if round 1, or winners from previous round)
    let eligibleFids: number[] = [];

    if (game.current_round === 1) {
      // Round 1: use all signups
      const signups = await pokerDb.fetch<{ fid: number }>("buddy_up_signups", {
        filters: { game_id: gameId },
        limit: 1000,
      });
      eligibleFids = (signups || []).map((s) => Number(s.fid));
    } else {
      // Later rounds: use winners from previous round
      const prevRound = await pokerDb.fetch<{ id: string }>("buddy_up_rounds", {
        filters: { game_id: gameId, round_number: game.current_round - 1 },
        limit: 1,
      });

      if (prevRound && prevRound.length > 0) {
        const prevRoundId = prevRound[0].id;
        const completedGroups = await pokerDb.fetch<{ winner_fid: number }>("buddy_up_groups", {
          filters: { round_id: prevRoundId, status: "completed" },
          limit: 1000,
        });
        eligibleFids = (completedGroups || [])
          .map((g) => Number(g.winner_fid))
          .filter((fid) => fid > 0);
      }
    }

    if (eligibleFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No eligible players for this round" }, { status: 400 });
    }

    let groups: Array<{ groupNumber: number; fids: number[] }> = [];

    if (customGroups && customGroups.length > 0) {
      // Use custom groups
      // Validate: all FIDs are in eligibleFids, no duplicates
      const usedFids = new Set<number>();
      for (const customGroup of customGroups) {
        if (!Array.isArray(customGroup.fids)) {
          return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid customGroups format" }, { status: 400 });
        }
        for (const fid of customGroup.fids) {
          const fidNum = Number(fid);
          if (!eligibleFids.includes(fidNum)) {
            return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${fidNum} is not eligible for this round` }, { status: 400 });
          }
          if (usedFids.has(fidNum)) {
            return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${fidNum} appears in multiple groups` }, { status: 400 });
          }
          usedFids.add(fidNum);
        }
      }
      groups = customGroups.map((g: any) => ({
        groupNumber: Number(g.groupNumber),
        fids: g.fids.map((f: any) => Number(f)),
      }));
    } else {
      // Random groups
      const shuffled = shuffle(eligibleFids);
      let groupNumber = 1;
      for (let i = 0; i < shuffled.length; i += groupSize) {
        groups.push({
          groupNumber,
          fids: shuffled.slice(i, i + groupSize),
        });
        groupNumber++;
      }
    }

    // Create round
    const now = new Date().toISOString();
    const round = await pokerDb.insert(
      "buddy_up_rounds",
      [
        {
          game_id: gameId,
          round_number: game.current_round,
          group_size: groupSize,
          status: "grouping",
          created_at: now,
          updated_at: now,
        },
      ],
      "id"
    );

    if (!round || round.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create round" }, { status: 500 });
    }

    const roundId = (round[0] as any).id;

    // Create groups
    const groupInserts = groups.map((g) => ({
      round_id: roundId,
      group_number: g.groupNumber,
      fids: g.fids,
      status: "voting",
      created_at: now,
      updated_at: now,
    }));

    await pokerDb.insert("buddy_up_groups", groupInserts);

    // Update round status to 'voting'
    await pokerDb.update("buddy_up_rounds", { id: roundId }, { status: "voting", updated_at: now });

    // Clear advance_at when next round is created (in-round countdown no longer needed)
    await pokerDb.update("buddy_up_games", { id: gameId }, { advance_at: null, updated_at: now });

    const response = NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        roundId,
        roundNumber: game.current_round,
        groups: groups.map((g) => ({ groupNumber: g.groupNumber, fids: g.fids })),
      },
    });

    // Round-started notification: send in after() so 200 returns first (same pattern as game-created/start)
    const fidsForNotify = [...new Set(groups.flatMap((g) => g.fids))];
    if (process.env.ENABLE_PUSH_NOTIFICATIONS === "true" && fidsForNotify.length > 0) {
      const { after } = await import("next/server");
      const { sendBulkNotifications } = await import("~/lib/notifications");
      const { APP_URL } = await import("~/lib/constants");
      const roundNumber = game.current_round;
      const payload = {
        title: `BUDDY UP Round ${roundNumber} started`,
        body: "Vote in your group to advance.",
        targetUrl: new URL(`/buddy-up?gameId=${gameId}`, APP_URL).href,
      };
      const notificationId = `round_started:${gameId}:${roundNumber}`;
      after(async () => {
        try {
          await sendBulkNotifications(fidsForNotify, payload, notificationId);
        } catch (e) {
          console.error("[buddy-up/games/[id]/rounds] Round-started notification failed:", e);
        }
      });
    }

    return response;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/rounds POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create round" }, { status: 500 });
  }
}
