/**
 * POST /api/betr-games/register
 * Register the current user for BETR GAMES (payout list, future whitelist).
 * 
 * Phase 22: No staking requirement. Pre-approved FIDs get instant approval.
 * Others go to pending status until admin approves.
 *
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT.
 * Idempotent: one row per FID; re-click returns alreadyRegistered: true.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { BETR_GAMES_PRE_APPROVED_FIDS } from "~/lib/constants";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

const SOURCE = "betr_games_button";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Phase 22.9: Check if tournament has been started for BETR community
    // (registration closed when betr_games_tournament_players has rows for this community)
    // Phase 36: user-facing registration is always for 'betr' community only
    const tournamentRows = await pokerDb.fetch<{ fid: number }>(
      "betr_games_tournament_players", { select: "fid", filters: { community: 'betr' }, limit: 1 }
    );
    if (tournamentRows && tournamentRows.length > 0) {
      safeLog("info", "[betr-games/register] Registration closed (tournament started)", { fid });
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: "Registration closed for BETR GAMES.",
          data: { reason: "registration_closed" as const },
        },
        { status: 403 }
      );
    }

    // Check if already registered for BETR community
    const existing = await pokerDb.fetch<{ fid: number; approved_at: string | null }>("betr_games_registrations", {
      filters: { fid, community: 'betr' },
      select: "fid,approved_at",
      limit: 1,
    });

    if (existing && existing.length > 0) {
      safeLog("info", "[betr-games/register] Already registered", { fid });
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { 
          registered: true, 
          alreadyRegistered: true,
          approved: existing[0].approved_at !== null,
        },
      });
    }

    // Phase 22: Check if FID is pre-approved (auto-approve)
    const isPreApproved = BETR_GAMES_PRE_APPROVED_FIDS.includes(fid);
    
    // Insert with approval if pre-approved (always community='betr' for user-facing registration)
    if (isPreApproved) {
      await pokerDb.insert("betr_games_registrations", { 
        fid, 
        source: SOURCE,
        community: 'betr',
        approved_at: new Date().toISOString(),
        approved_by: null, // null = auto-approved
      });
      safeLog("info", "[betr-games/register] Registered (auto-approved)", { fid });
    } else {
      await pokerDb.insert("betr_games_registrations", { fid, source: SOURCE, community: 'betr' });
      safeLog("info", "[betr-games/register] Registered (pending approval)", { fid });
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { 
        registered: true, 
        alreadyRegistered: false,
        approved: isPreApproved,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    safeLog("error", "[betr-games/register] Error", { error: err?.message ?? String(error) });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to register" },
      { status: 500 }
    );
  }
}
