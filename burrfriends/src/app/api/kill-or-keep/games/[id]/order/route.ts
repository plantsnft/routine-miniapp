/**
 * PATCH /api/kill-or-keep/games/[id]/order - Set turn order and optional amounts (admin only)
 * Only when status = 'open'. All FIDs must be alive (betr_games_tournament_players, community betr).
 * Body: turnOrderFids (+ optional amountByFid) OR tftpGameId (uuid of settled Take from the Pile game).
 * Phase 38.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function PATCH(
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
    const tftpGameId = typeof body.tftpGameId === "string" ? body.tftpGameId.trim() || null : null;
    let turnOrderFids: number[] | null = Array.isArray(body.turnOrderFids) ? body.turnOrderFids.map((f: unknown) => Number(f)).filter(Number.isFinite) : null;
    let amountByFid: Record<string, number> | undefined = body.amountByFid && typeof body.amountByFid === "object" ? body.amountByFid : undefined;

    if (tftpGameId && turnOrderFids && turnOrderFids.length > 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Provide either tftpGameId or turnOrderFids, not both" }, { status: 400 });
    }

    if (tftpGameId) {
      const tftpGames = await pokerDb.fetch<{ id: string; status: string }>("take_from_the_pile_games", {
        filters: { id: tftpGameId },
        limit: 1,
      });
      if (!tftpGames || tftpGames.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Take from the Pile game not found" }, { status: 404 });
      }
      if (tftpGames[0].status !== "settled") {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Take from the Pile game must be settled (ended) before importing order" }, { status: 400 });
      }

      const settlements = await pokerDb.fetch<{ fid: number; amount: number }>("take_from_the_pile_settlements", {
        filters: { game_id: tftpGameId },
        select: "fid,amount",
        limit: 5000,
      });
      const events = await pokerDb.fetch<{ sequence: number; fid: number; event_type: string }>("take_from_the_pile_events", {
        filters: { game_id: tftpGameId },
        select: "sequence,fid,event_type",
        order: "sequence.asc",
        limit: 5000,
      });

      const amountMap = new Map<number, number>();
      for (const s of settlements || []) {
        amountMap.set(Number(s.fid), Number(s.amount) || 0);
      }
      const firstPickSequenceMap = new Map<number, number>();
      for (const e of events || []) {
        if (e.event_type === "pick") {
          const f = Number(e.fid);
          const seq = Number(e.sequence);
          if (!firstPickSequenceMap.has(f) || firstPickSequenceMap.get(f)! > seq) {
            firstPickSequenceMap.set(f, seq);
          }
        }
      }
      const allFids = new Set<number>();
      for (const s of settlements || []) allFids.add(Number(s.fid));
      for (const e of events || []) allFids.add(Number(e.fid));

      const ordered = Array.from(allFids).sort((a, b) => {
        const amtA = amountMap.get(a) ?? 0;
        const amtB = amountMap.get(b) ?? 0;
        if (amtA !== amtB) return amtA - amtB;
        const seqA = firstPickSequenceMap.get(a) ?? Number.POSITIVE_INFINITY;
        const seqB = firstPickSequenceMap.get(b) ?? Number.POSITIVE_INFINITY;
        return seqA - seqB;
      });

      const alive = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        filters: { status: "alive", community: "betr" },
        select: "fid",
        limit: 10000,
      });
      const aliveSet = new Set((alive || []).map((p) => Number(p.fid)));
      turnOrderFids = ordered.filter((f) => aliveSet.has(f));
      if (turnOrderFids.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "No alive BETR players in that Take from the Pile game" }, { status: 400 });
      }
      amountByFid = {};
      for (const f of turnOrderFids) {
        amountByFid[String(f)] = amountMap.get(f) ?? 0;
      }
    }

    if (!turnOrderFids || turnOrderFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "turnOrderFids must be a non-empty array, or provide tftpGameId" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{ id: string; status: string }>("kill_or_keep_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    if (games[0].status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Order can only be set when game is open" }, { status: 400 });
    }

    const alive = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
      filters: { status: "alive", community: "betr" },
      select: "fid",
      limit: 10000,
    });
    const aliveSet = new Set((alive || []).map((p) => Number(p.fid)));
    const duplicates = turnOrderFids.length !== new Set(turnOrderFids).size;
    if (duplicates) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "turnOrderFids must not contain duplicates" }, { status: 400 });
    }
    for (const f of turnOrderFids) {
      if (!aliveSet.has(f)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `FID ${f} is not an alive BETR player` }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      turn_order_fids: turnOrderFids,
      updated_at: now,
    };
    if (amountByFid !== undefined) updatePayload.amount_by_fid = amountByFid;

    await pokerDb.update("kill_or_keep_games", { id: gameId }, updatePayload);

    return NextResponse.json<ApiResponse>({ ok: true, data: { turnOrderFids, amountByFid: amountByFid ?? null } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/order PATCH]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to set order" }, { status: 500 });
  }
}
