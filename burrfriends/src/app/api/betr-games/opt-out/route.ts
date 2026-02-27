/**
 * POST /api/betr-games/opt-out
 * Player opts out of BETR GAMES registration.
 * 
 * Phase 25: Opt-Out & Admin Registration Management
 *
 * Logic:
 * - If user is rejected: return success but DON'T delete (preserve rejection)
 * - If before deadline: DELETE from betr_games_registrations (can re-register)
 * - If after deadline: UPDATE betr_games_tournament_players SET status='quit'
 *
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Check if user is registered
    const existing = await pokerDb.fetch<{ 
      fid: number; 
      approved_at: string | null;
      rejected_at: string | null;
    }>("betr_games_registrations", {
      filters: { fid },
      select: "fid,approved_at,rejected_at",
      limit: 1,
    });

    if (!existing || existing.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Not registered for BETR GAMES" },
        { status: 400 }
      );
    }

    // Edge case: If user is rejected, pretend to opt out but preserve the row
    // This ensures rejected users cannot re-register
    if (existing[0].rejected_at !== null) {
      safeLog("info", "[betr-games/opt-out] Rejected user opted out (row preserved)", { fid });
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { optedOut: true, canReregister: false },
      });
    }

    // Phase 22.9: Check if registration is closed (tournament started)
    const tournamentRows = await pokerDb.fetch<{ fid: number }>(
      "betr_games_tournament_players", { select: "fid", limit: 1 }
    );
    const registrationClosed = Boolean(tournamentRows && tournamentRows.length > 0);

    if (registrationClosed) {
      // After tournament start: set status='quit' in tournament_players
      // Check if user is in tournament
      const tournamentPlayer = await pokerDb.fetch<{ fid: number; status: string }>(
        "betr_games_tournament_players",
        {
          filters: { fid },
          select: "fid,status",
          limit: 1,
        }
      );

      if (tournamentPlayer && tournamentPlayer.length > 0) {
        await pokerDb.update("betr_games_tournament_players", { fid }, {
          status: 'quit',
          eliminated_at: new Date().toISOString(),
          eliminated_reason: 'Player opted out',
        });
        safeLog("info", "[betr-games/opt-out] Player quit tournament", { fid });
      }

      // Also delete from registrations for consistency
      await pokerDb.delete("betr_games_registrations", { fid });

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { optedOut: true, canReregister: false },
      });
    } else {
      // Before deadline: delete from registrations
      await pokerDb.delete("betr_games_registrations", { fid });
      safeLog("info", "[betr-games/opt-out] Player opted out (before tournament start)", { fid });

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { optedOut: true, canReregister: true },
      });
    }
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    safeLog("error", "[betr-games/opt-out] Error", { error: err?.message ?? String(error) });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to opt out" },
      { status: 500 }
    );
  }
}
