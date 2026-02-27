/**
 * POST /api/bullied/games/[id]/start - Start game (admin only)
 * Creates the single round with groups from alive tournament players.
 * Supports customGroups or auto-shuffle into groups of 3.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { isGlobalAdmin } from "~/lib/permissions";
import { hasBetaAccess } from "~/lib/beta";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

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

    // Check game exists and is open
    const games = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>(
      "bullied_games",
      { filters: { id: gameId }, limit: 1 }
    );

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in open phase" }, { status: 400 });
    }

    // Fetch alive tournament players
    const alivePlayers = await pokerDb.fetch<{ fid: number }>(
      "betr_games_tournament_players",
      { filters: { status: "alive" } }
    );

    const eligibleFids = (alivePlayers || []).map((p) => Number(p.fid));

    // Preview bypass: if game is_preview and caller is global admin, add their fid
    if (game.is_preview === true && (isGlobalAdmin(fid) || hasBetaAccess(req))) {
      if (!eligibleFids.includes(fid)) {
        eligibleFids.push(fid);
      }
    }

    if (eligibleFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No eligible players found" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const customGroups: Array<{ groupNumber: number; fids: number[] }> | undefined = body.customGroups;

    let groupAssignments: Array<{ groupNumber: number; fids: number[] }>;

    if (customGroups && Array.isArray(customGroups) && customGroups.length > 0) {
      // Validate custom groups
      const allCustomFids = new Set<number>();
      for (const cg of customGroups) {
        for (const f of cg.fids) {
          if (!eligibleFids.includes(f)) {
            return NextResponse.json<ApiResponse>(
              { ok: false, error: `FID ${f} is not an eligible player` },
              { status: 400 }
            );
          }
          if (allCustomFids.has(f)) {
            return NextResponse.json<ApiResponse>(
              { ok: false, error: `FID ${f} appears in multiple groups` },
              { status: 400 }
            );
          }
          allCustomFids.add(f);
        }
      }
      groupAssignments = customGroups;
    } else {
      // Auto-shuffle into groups of 3
      const shuffled = shuffle(eligibleFids);
      groupAssignments = [];
      let groupNum = 1;
      for (let i = 0; i < shuffled.length; i += 3) {
        groupAssignments.push({
          groupNumber: groupNum++,
          fids: shuffled.slice(i, i + 3),
        });
      }
    }

    // Create the single round
    const now = new Date().toISOString();
    const roundRows = await pokerDb.insert("bullied_rounds", [
      {
        game_id: gameId,
        round_number: 1,
        group_size: 3,
        status: "voting",
        created_at: now,
        updated_at: now,
      },
    ]);

    if (!roundRows || roundRows.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create round" }, { status: 500 });
    }

    const round = roundRows[0] as unknown as { id: string };
    const roundId = round.id;

    // Create groups
    const createdGroups: Array<{ id: string; groupNumber: number; fids: number[]; status: string }> = [];

    for (const ga of groupAssignments) {
      const isAutoAdvance = ga.fids.length === 1;
      const groupStatus = isAutoAdvance ? "completed" : "voting";
      const winnerFid = isAutoAdvance ? ga.fids[0] : null;

      const groupRows = await pokerDb.insert("bullied_groups", [
        {
          round_id: roundId,
          group_number: ga.groupNumber,
          fids: ga.fids,
          status: groupStatus,
          ...(winnerFid != null ? { winner_fid: winnerFid } : {}),
          created_at: now,
          updated_at: now,
        },
      ]);

      if (groupRows && groupRows.length > 0) {
        const g = groupRows[0] as unknown as { id: string };
        createdGroups.push({
          id: g.id,
          groupNumber: ga.groupNumber,
          fids: ga.fids,
          status: groupStatus,
        });
      }
    }

    // Update game to in_progress and set room timer to 24h (Phase 33.11)
    const roomTimerEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await pokerDb.update("bullied_games", { id: gameId }, {
      status: "in_progress",
      updated_at: now,
      room_timer_ends_at: roomTimerEndsAt,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { roundId, groups: createdGroups },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[bullied/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
