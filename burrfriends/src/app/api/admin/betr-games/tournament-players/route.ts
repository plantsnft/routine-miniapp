/**
 * GET /api/admin/betr-games/tournament-players
 * List all tournament players with their status.
 * 
 * Phase 22: Tournament management
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    // Get query params for filtering
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status"); // 'alive', 'eliminated', 'quit', or null for all

    // Get all tournament players
    const allPlayers = await pokerDb.fetch<{
      fid: number;
      status: string;
      eliminated_at: string | null;
      eliminated_reason: string | null;
      created_at: string;
    }>("betr_games_tournament_players", {
      select: "fid,status,eliminated_at,eliminated_reason,created_at",
      order: "created_at.desc",
      limit: 10000,
    });

    if (!allPlayers || allPlayers.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { 
          players: [], 
          counts: { total: 0, alive: 0, eliminated: 0, quit: 0 } 
        },
      });
    }

    // Filter by status if specified
    const filteredPlayers = statusFilter 
      ? allPlayers.filter(p => p.status === statusFilter)
      : allPlayers;

    // Get profiles for all FIDs
    const fids = filteredPlayers.map(p => p.fid);
    const client = getNeynarClient();
    const profiles: Record<number, { username: string; display_name: string; pfp_url: string }> = {};

    try {
      // Batch in groups of 100
      for (let i = 0; i < fids.length; i += 100) {
        const batch = fids.slice(i, i + 100);
        const response = await client.fetchBulkUsers({ fids: batch });
        for (const user of response.users || []) {
          profiles[user.fid] = {
            username: user.username || `fid:${user.fid}`,
            display_name: user.display_name || user.username || `FID ${user.fid}`,
            pfp_url: user.pfp_url || '',
          };
        }
      }
    } catch {
      // Profiles optional
    }

    const enriched = filteredPlayers.map(p => ({
      fid: p.fid,
      status: p.status,
      eliminated_at: p.eliminated_at,
      eliminated_reason: p.eliminated_reason,
      created_at: p.created_at,
      username: profiles[p.fid]?.username || `fid:${p.fid}`,
      display_name: profiles[p.fid]?.display_name || `FID ${p.fid}`,
      pfp_url: profiles[p.fid]?.pfp_url || '',
    }));

    // Calculate counts from all players (not filtered)
    const counts = {
      total: allPlayers.length,
      alive: allPlayers.filter(p => p.status === 'alive').length,
      eliminated: allPlayers.filter(p => p.status === 'eliminated').length,
      quit: allPlayers.filter(p => p.status === 'quit').length,
    };

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { players: enriched, counts },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to get tournament players" },
      { status: 500 }
    );
  }
}
