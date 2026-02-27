/**
 * POST /api/admin/betr-games/reinstate
 * Reinstate an eliminated tournament player back to alive status.
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
    const { fid } = body;

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

    if (existing[0].status === 'alive') {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { reinstated: true, alreadyAlive: true },
      });
    }

    // Reinstate the player
    await pokerDb.update("betr_games_tournament_players", 
      { fid },
      { 
        status: 'alive',
        eliminated_at: null,
        eliminated_reason: null,
      }
    );

    safeLog("info", "[admin/betr-games/reinstate] Player reinstated", { fid, adminFid });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { reinstated: true, alreadyAlive: false },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    safeLog("error", "[admin/betr-games/reinstate] Error", { error: err?.message ?? String(error) });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to reinstate player" },
      { status: 500 }
    );
  }
}
