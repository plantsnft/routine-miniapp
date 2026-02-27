/**
 * GET /api/take-from-the-pile/games/[id] - Get game detail by ID
 * No is_preview filter so preview games are playable by direct URL.
 * When in_progress: currentTurnFid, nextTurnFid, eligibleCount, turnOrderWithProfiles, current_pot_amount, current_turn_ends_at, timer_paused_at, events (for live Activity).
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    const games = await pokerDb.fetch<any>("take_from_the_pile_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: true, data: game });
    }

    const turnOrderFids = (game.turn_order_fids || []) as number[];
    const currentTurnFid = turnOrderFids.length > 0 ? Number(turnOrderFids[0]) : null;
    const nextTurnFid = turnOrderFids.length > 1 ? Number(turnOrderFids[1]) : null;

    const alivePlayers = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
      filters: { status: "alive", community: "betr" },
      select: "fid",
      limit: 100000,
    });
    const eligibleCount = (alivePlayers || []).length;

    let turnOrderWithProfiles: Array<{ position: number; fid: number; username: string; display_name: string; pfp_url: string }> = [];
    if (turnOrderFids.length > 0) {
      const profiles: Record<number, { username: string; display_name: string; pfp_url: string }> = {};
      try {
        const client = getNeynarClient();
        for (let i = 0; i < turnOrderFids.length; i += 100) {
          const batch = turnOrderFids.slice(i, i + 100).map((f) => Number(f));
          const response = await client.fetchBulkUsers({ fids: batch });
          for (const user of response.users || []) {
            profiles[user.fid] = {
              username: user.username || `fid:${user.fid}`,
              display_name: user.display_name || user.username || `FID ${user.fid}`,
              pfp_url: user.pfp_url || "",
            };
          }
        }
      } catch {
        // Profiles optional; fallbacks used below
      }
      turnOrderWithProfiles = turnOrderFids.map((fid, idx) => {
        const f = Number(fid);
        return {
          position: idx + 1,
          fid: f,
          username: profiles[f]?.username ?? `fid:${f}`,
          display_name: profiles[f]?.display_name ?? `FID ${f}`,
          pfp_url: profiles[f]?.pfp_url ?? "",
        };
      });
    }

    const eventsRaw = await pokerDb.fetch<any>("take_from_the_pile_events", {
      filters: { game_id: gameId },
      select: "sequence,fid,event_type,amount_taken",
      order: "sequence.asc",
      limit: 5000,
    });
    const eventsList = (eventsRaw || []).sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));
    const eventFids = [...new Set(eventsList.map((e: any) => Number(e.fid)))];
    const eventProfiles: Record<number, { username: string; display_name: string; pfp_url: string }> = {};
    if (eventFids.length > 0) {
      try {
        const client = getNeynarClient();
        for (let i = 0; i < eventFids.length; i += 100) {
          const batch = eventFids.slice(i, i + 100);
          const response = await client.fetchBulkUsers({ fids: batch });
          for (const user of response.users || []) {
            eventProfiles[user.fid] = {
              username: user.username || `fid:${user.fid}`,
              display_name: user.display_name || user.username || `FID ${user.fid}`,
              pfp_url: user.pfp_url || "",
            };
          }
        }
      } catch {
        // Profiles optional
      }
    }
    const events = eventsList.map((e: any) => {
      const f = Number(e.fid);
      return {
        sequence: Number(e.sequence),
        fid: f,
        event_type: e.event_type || "pick",
        amount_taken: e.amount_taken != null ? Number(e.amount_taken) : null,
        display_name: eventProfiles[f]?.display_name ?? `FID ${f}`,
        username: eventProfiles[f]?.username ?? `fid:${f}`,
        pfp_url: eventProfiles[f]?.pfp_url ?? "",
      };
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        ...game,
        currentTurnFid,
        nextTurnFid,
        eligibleCount,
        turnOrderWithProfiles,
        events,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[take-from-the-pile/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
