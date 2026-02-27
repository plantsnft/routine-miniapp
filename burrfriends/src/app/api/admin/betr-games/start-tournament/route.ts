/**
 * POST /api/admin/betr-games/start-tournament
 * Copy all approved registrations to tournament_players as 'alive'.
 * This officially starts the tournament.
 * 
 * Phase 22: Tournament management
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid: adminFid } = await requireAuth(req);

    if (!isAdmin(adminFid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    // Phase 36: Accept community param (default 'betr')
    const body = await req.json().catch(() => ({}));
    const community: 'betr' | 'minted_merch' = body.community === 'minted_merch' ? 'minted_merch' : 'betr';

    // Get all approved registrations for this community
    const allRegs = await pokerDb.fetch<{
      fid: number;
      approved_at: string | null;
    }>("betr_games_registrations", {
      select: "fid,approved_at",
      filters: { community },
      limit: 10000,
    });

    const approvedRegs = (allRegs || []).filter(r => r.approved_at !== null);

    if (approvedRegs.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `No approved registrations to start ${community} tournament` },
        { status: 400 }
      );
    }

    // Check if tournament already has players for this community
    const existingPlayers = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
      select: "fid",
      filters: { community },
      limit: 1,
    });

    if (existingPlayers && existingPlayers.length > 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `${community} tournament already started. Clear existing players first if you want to restart.` },
        { status: 400 }
      );
    }

    // Insert all approved registrations as 'alive' tournament players for this community
    const now = new Date().toISOString();
    const playersToInsert = approvedRegs.map(r => ({
      fid: r.fid,
      status: 'alive',
      community,
      created_at: now,
    }));

    // Insert in batches of 100
    for (let i = 0; i < playersToInsert.length; i += 100) {
      const batch = playersToInsert.slice(i, i + 100);
      await pokerDb.insert("betr_games_tournament_players", batch);
    }

    safeLog("info", "[admin/betr-games/start-tournament] Tournament started", { 
      adminFid, 
      community,
      playerCount: approvedRegs.length 
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { 
        started: true, 
        community,
        playerCount: approvedRegs.length,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    safeLog("error", "[admin/betr-games/start-tournament] Error", { error: err?.message ?? String(error) });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to start tournament" },
      { status: 500 }
    );
  }
}
