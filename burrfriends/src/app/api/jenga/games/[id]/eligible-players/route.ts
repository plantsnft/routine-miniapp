/**
 * GET /api/jenga/games/[id]/eligible-players - Get eligible players for settlement (admin only)
 * Returns non-eliminated players with profiles from database
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    // Fetch game
    const games = await pokerDb.fetch<{
      id: string;
      turn_order: number[];
      eliminated_fids: number[];
    }>("jenga_games", {
      filters: { id: gameId },
      select: "id,turn_order,eliminated_fids",
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    const turnOrder = game.turn_order || [];
    const eliminatedFids = game.eliminated_fids || [];

    // Get eligible players (in turn_order, not eliminated)
    const eligibleFids = turnOrder.filter((fid) => !eliminatedFids.includes(fid));

    if (eligibleFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    // Fetch signups with cached profiles (from database, no Neynar call)
    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("jenga_signups", {
      filters: { game_id: gameId },
      select: "fid,username,display_name,pfp_url",
      limit: 100,
    });

    // Build eligible players list with profiles
    const eligiblePlayers = eligibleFids
      .map((fid) => {
        const signup = (signups || []).find((s) => Number(s.fid) === fid);
        return {
          fid,
          username: signup?.username || null,
          display_name: signup?.display_name || null,
          pfp_url: signup?.pfp_url || null,
        };
      })
      .filter((p) => p.fid); // Filter out any invalid entries

    return NextResponse.json<ApiResponse>({ ok: true, data: eligiblePlayers });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/eligible-players GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch eligible players" }, { status: 500 });
  }
}
