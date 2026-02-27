/**
 * POST /api/the-mole/games/[id]/rounds - Create new round (admin only)
 * Body: { groupSize: number, customGroups?: [{ groupNumber, fids, moleFid }], moleOverrides?: [{ groupNumber, moleFid }] }
 * For customGroups, each must have moleFid in fids. For random groups, mole is randomly picked per group; moleOverrides overrides.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
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
    const body = await req.json().catch(() => ({}));
    const groupSize = typeof body.groupSize === "number" ? body.groupSize : parseInt(String(body.groupSize || ""), 10);
    const customGroups = Array.isArray(body.customGroups) ? body.customGroups : undefined;
    const moleOverrides = Array.isArray(body.moleOverrides) ? body.moleOverrides as { groupNumber: number; moleFid: number }[] : undefined;

    if (isNaN(groupSize) || groupSize < 1 || groupSize > 10) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "groupSize must be between 1 and 10" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{ id: string; status: string; current_round: number }>("mole_games", {
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

    const existingRound = await pokerDb.fetch<{ id: string }>("mole_rounds", {
      filters: { game_id: gameId, round_number: game.current_round },
      limit: 1,
    });

    if (existingRound && existingRound.length > 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: `Round ${game.current_round} already exists. Complete it before creating the next round.` }, { status: 400 });
    }

    let eligibleFids: number[] = [];

    if (game.current_round === 1) {
      const signups = await pokerDb.fetch<{ fid: number }>("mole_signups", {
        filters: { game_id: gameId },
        limit: 1000,
      });
      eligibleFids = (signups || []).map((s) => Number(s.fid));
    } else {
      const prevRound = await pokerDb.fetch<{ id: string }>("mole_rounds", {
        filters: { game_id: gameId, round_number: game.current_round - 1 },
        limit: 1,
      });

      if (prevRound && prevRound.length > 0) {
        const prevRoundId = prevRound[0].id;
        const completedGroups = await pokerDb.fetch<{ fids: number[]; mole_fid: number }>("mole_groups", {
          filters: { round_id: prevRoundId, status: "completed" },
          limit: 1000,
        });
        for (const g of completedGroups || []) {
          const m = Number(g.mole_fid);
          for (const f of g.fids || []) {
            const n = Number(f);
            if (n !== m) eligibleFids.push(n);
          }
        }
      }
    }

    if (eligibleFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No eligible players for this round" }, { status: 400 });
    }

    const groups: Array<{ groupNumber: number; fids: number[]; moleFid: number }> = [];

    if (customGroups && customGroups.length > 0) {
      const usedFids = new Set<number>();
      for (const cg of customGroups as { groupNumber: number; fids: number[]; moleFid: number }[]) {
        if (!Array.isArray(cg.fids)) {
          return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid customGroups format" }, { status: 400 });
        }
        const fids = cg.fids.map((f: number) => Number(f));
        const moleFid = Number(cg.moleFid);
        if (!fids.includes(moleFid)) {
          return NextResponse.json<ApiResponse>({ ok: false, error: `moleFid ${moleFid} must be in group ${cg.groupNumber} fids` }, { status: 400 });
        }
        for (const f of fids) {
          if (!eligibleFids.includes(f)) {
            return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${f} is not eligible for this round` }, { status: 400 });
          }
          if (usedFids.has(f)) {
            return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${f} appears in multiple groups` }, { status: 400 });
          }
          usedFids.add(f);
        }
        groups.push({ groupNumber: Number(cg.groupNumber), fids, moleFid });
      }
    } else {
      const shuffled = shuffle(eligibleFids);
      let groupNumber = 1;
      const moleOverrideMap = new Map<number, number>();
      for (const o of moleOverrides || []) {
        moleOverrideMap.set(Number(o.groupNumber), Number(o.moleFid));
      }
      for (let i = 0; i < shuffled.length; i += groupSize) {
        const fids = shuffled.slice(i, i + groupSize);
        const override = moleOverrideMap.get(groupNumber);
        const moleFid = override != null && fids.includes(override)
          ? override
          : fids[Math.floor(Math.random() * fids.length)]!;
        groups.push({ groupNumber, fids, moleFid });
        groupNumber++;
      }
    }

    const now = new Date().toISOString();
    const round = await pokerDb.insert(
      "mole_rounds",
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

    const roundId = String((round[0] as Record<string, unknown>)?.id ?? '');

    const groupInserts = groups.map((g) => ({
      round_id: roundId,
      group_number: g.groupNumber,
      fids: g.fids,
      mole_fid: g.moleFid,
      status: "voting",
      created_at: now,
      updated_at: now,
    }));

    await pokerDb.insert("mole_groups", groupInserts);

    await pokerDb.update("mole_rounds", { id: roundId }, { status: "voting", updated_at: now });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        roundId,
        roundNumber: game.current_round,
        groups: groups.map((g) => ({ groupNumber: g.groupNumber, fids: g.fids, moleFid: g.moleFid })),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[the-mole/games/[id]/rounds POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to create round" }, { status: 500 });
  }
}
