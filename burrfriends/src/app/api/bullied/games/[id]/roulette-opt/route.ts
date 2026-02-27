/**
 * POST /api/bullied/games/[id]/roulette-opt - Player opts in or out of Roulette Wheel for their group
 *
 * Body: { roundId: string, groupId: string, optIn: boolean }
 *
 * - optIn=true: adds caller FID to roulette_opted_fids; if all members have opted in, locks (roulette_locked_at = now())
 * - optIn=false: removes caller FID from roulette_opted_fids; only allowed when roulette_locked_at IS NULL
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const body = await req.json();
    const { roundId, groupId, optIn } = body as {
      roundId: string;
      groupId: string;
      optIn: boolean;
    };

    if (!roundId || !groupId || typeof optIn !== "boolean") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "roundId, groupId, and optIn are required" }, { status: 400 });
    }

    // Fetch game to confirm roulette is deployed and game is in_progress
    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      roulette_wheel_deployed_at: string | null;
    }>("bullied_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    if (!game.roulette_wheel_deployed_at) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Roulette Wheel has not been deployed for this game" }, { status: 400 });
    }

    // Fetch group
    const groups = await pokerDb.fetch<{
      id: string;
      round_id: string;
      fids: number[];
      status: string;
      roulette_opted_fids: number[];
      roulette_locked_at: string | null;
    }>("bullied_groups", {
      filters: { id: groupId },
      limit: 1,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const group = groups[0];

    if (group.round_id !== roundId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group does not belong to this round" }, { status: 400 });
    }

    if (group.status !== "voting") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group is no longer in voting status" }, { status: 400 });
    }

    // Verify caller is in group
    const groupFids = (group.fids || []).map((f) => Number(f));
    if (!groupFids.includes(Number(fid))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You are not in this group" }, { status: 403 });
    }

    const currentOptedFids = (group.roulette_opted_fids || []).map((f) => Number(f));
    const now = new Date().toISOString();

    if (optIn) {
      // Already opted in — idempotent
      if (currentOptedFids.includes(Number(fid))) {
        return NextResponse.json<ApiResponse>({
          ok: true,
          data: {
            rouletteOptedFids: currentOptedFids,
            rouletteLockedAt: group.roulette_locked_at || null,
          },
        });
      }

      const newOptedFids = [...currentOptedFids, Number(fid)];
      const allOptedIn = newOptedFids.length >= groupFids.length;
      const newLockedAt = allOptedIn ? now : null;

      await pokerDb.update("bullied_groups", { id: groupId }, {
        roulette_opted_fids: newOptedFids,
        ...(allOptedIn ? { roulette_locked_at: now } : {}),
        updated_at: now,
      });

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          rouletteOptedFids: newOptedFids,
          rouletteLockedAt: newLockedAt,
        },
      });
    } else {
      // Opt out — only if not locked
      if (group.roulette_locked_at) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Roulette is locked — all 3 have chosen the wheel. Cannot opt out." }, { status: 400 });
      }

      // Not opted in — idempotent
      if (!currentOptedFids.includes(Number(fid))) {
        return NextResponse.json<ApiResponse>({
          ok: true,
          data: {
            rouletteOptedFids: currentOptedFids,
            rouletteLockedAt: null,
          },
        });
      }

      const newOptedFids = currentOptedFids.filter((f) => f !== Number(fid));

      await pokerDb.update("bullied_groups", { id: groupId }, {
        roulette_opted_fids: newOptedFids,
        updated_at: now,
      });

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          rouletteOptedFids: newOptedFids,
          rouletteLockedAt: null,
        },
      });
    }
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[bullied/games/[id]/roulette-opt POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to update roulette opt" }, { status: 500 });
  }
}
