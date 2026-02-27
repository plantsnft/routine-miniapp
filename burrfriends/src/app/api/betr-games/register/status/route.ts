/**
 * GET /api/betr-games/register/status
 * Check if the current user is registered for BETR GAMES.
 *
 * Phase 22: Also returns approval status and deadline info.
 * Phase 22.10: When registrationClosed, also returns tournamentStatus and aliveCount.
 *
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT.
 * Used by the bar to show "Registered ✓" when already signed up.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import { hasBetaAccess } from "~/lib/beta";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Phase 29.1: Global admins bypass registration gate (registered/approved/rejected overridden).
    // Phase 29.2: Users with beta access (cookie) also get registered: true, approved: true.
    // Phase 36: User-facing always checks 'betr' community only.
    // registrationClosed reflects actual tournament state so homepage shows correct closed/open UI.
    if (isGlobalAdmin(fid) || hasBetaAccess(req)) {
      const tournamentRows = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        select: "fid",
        filters: { community: 'betr' },
        limit: 1,
      });
      const registrationClosed = Boolean(tournamentRows && tournamentRows.length > 0);
      const data: {
        registered: boolean;
        approved: boolean;
        rejected: boolean;
        registrationClosed: boolean;
        tournamentStatus?: 'alive' | 'eliminated' | 'quit' | null;
        aliveCount?: number;
      } = {
        registered: true,
        approved: true,
        rejected: false,
        registrationClosed,
      };
      if (registrationClosed) {
        const aliveRows = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
          filters: { status: "alive", community: 'betr' },
          select: "fid",
          limit: 10000,
        });
        data.tournamentStatus = null; // Admin is not a tournament player
        data.aliveCount = aliveRows?.length ?? 0;
      }
      return NextResponse.json<ApiResponse>({ ok: true, data });
    }

    const [existing, tournamentRows] = await Promise.all([
      pokerDb.fetch<{ fid: number; approved_at: string | null; rejected_at: string | null }>("betr_games_registrations", {
        filters: { fid, community: 'betr' }, // Phase 36: always 'betr' for user-facing
        select: "fid,approved_at,rejected_at",
        limit: 1,
      }),
      pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        select: "fid",
        filters: { community: 'betr' }, // Phase 36: always 'betr' for user-facing
        limit: 1,
      }),
    ]);

    const registered = Boolean(existing && existing.length > 0);
    const approved = registered && !!existing[0].approved_at && !existing[0].rejected_at;
    const rejected = registered && !!existing[0].rejected_at;
    const registrationClosed = Boolean(tournamentRows && tournamentRows.length > 0);

    const data: {
      registered: boolean;
      approved: boolean;
      rejected: boolean;
      registrationClosed: boolean;
      tournamentStatus?: 'alive' | 'eliminated' | 'quit' | null;
      aliveCount?: number;
    } = {
      registered,
      approved,
      rejected,
      registrationClosed,
    };

    // Phase 22.10: When registration closed, add tournament status and alive count (same source as admin).
    if (registrationClosed) {
      const [myRow, aliveRows] = await Promise.all([
        pokerDb.fetch<{ status: string }>("betr_games_tournament_players", {
          filters: { fid, community: 'betr' }, // Phase 36
          select: "status",
          limit: 1,
        }),
        pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
          filters: { status: "alive", community: 'betr' }, // Phase 36
          select: "fid",
          limit: 10000,
        }),
      ]);
      data.tournamentStatus =
        myRow && myRow.length > 0 && (myRow[0].status === 'alive' || myRow[0].status === 'eliminated' || myRow[0].status === 'quit')
          ? (myRow[0].status as 'alive' | 'eliminated' | 'quit')
          : null;
      data.aliveCount = aliveRows?.length ?? 0;
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to get registration status" },
      { status: 500 }
    );
  }
}
