/**
 * POST /api/admin/betr-games/eliminate
 * Mark a tournament player as eliminated.
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

    const body = await req.json();
    const { fid, reason } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "fid is required" },
        { status: 400 }
      );
    }

    // Check if player exists in tournament
    const existing = await pokerDb.fetch<{ fid: number; status: string }>("betr_games_tournament_players", {
      filters: { fid },
      select: "fid,status",
      limit: 1,
    });

    if (!existing || existing.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Player not found in tournament" },
        { status: 404 }
      );
    }

    if (existing[0].status === 'eliminated') {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { eliminated: true, alreadyEliminated: true },
      });
    }

    // Eliminate the player
    await pokerDb.update("betr_games_tournament_players", 
      { fid },
      { 
        status: 'eliminated',
        eliminated_at: new Date().toISOString(),
        eliminated_reason: reason || null,
      }
    );

    safeLog("info", "[admin/betr-games/eliminate] Player eliminated", { fid, reason, adminFid });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { eliminated: true, alreadyEliminated: false },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    safeLog("error", "[admin/betr-games/eliminate] Error", { error: err?.message ?? String(error) });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to eliminate player" },
      { status: 500 }
    );
  }
}
