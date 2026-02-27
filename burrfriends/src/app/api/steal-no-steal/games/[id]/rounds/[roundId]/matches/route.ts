/**
 * GET /api/steal-no-steal/games/[id]/rounds/[roundId]/matches - Get all matches in round
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { canPlayPreviewGame } from "~/lib/permissions";
import { autoTimeoutMatches } from "~/lib/steal-no-steal-auto-close";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roundId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);

    const { id: gameId, roundId } = await params;

    // Phase 29.1: Fetch the game to check is_preview for admin bypass
    const gameRows = await pokerDb.fetch<{ id: string; is_preview?: boolean }>("steal_no_steal_games", {
      filters: { id: gameId },
      limit: 1,
    });
    const adminBypass = canPlayPreviewGame(fid, gameRows?.[0]?.is_preview, req);

    // Check registration (skip for admin preview bypass or admin — admins can view match list for live games)
    if (!adminBypass && !isAdmin(fid)) {
      const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
        filters: { fid },
        limit: 1,
      });
      if (!registered || registered.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
      }
    }

    // Auto-timeout expired matches
    await autoTimeoutMatches();

    // Verify round exists and belongs to game
    const rounds = await pokerDb.fetch<{ id: string; game_id: string; round_number: number; status: string }>(
      "steal_no_steal_rounds",
      { filters: { id: roundId }, limit: 1 }
    );

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }

    if (rounds[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round does not belong to this game" }, { status: 400 });
    }

    // Get matches
    const matches = await pokerDb.fetch<{
      id: string;
      match_number: number;
      player_a_fid: number;
      player_b_fid: number;
      briefcase_amount: number;
      briefcase_label: string | null;
      outcome_revealed_at: string | null;
      decision_deadline: string;
      status: string;
      decision: string | null;
      decided_at: string | null;
      winner_fid: number | null;
    }>("steal_no_steal_matches", {
      filters: { round_id: roundId },
      order: "match_number.asc",
      limit: 100,
    });

    // Get player profiles
    const allFids = new Set<number>();
    for (const m of matches || []) {
      allFids.add(Number(m.player_a_fid));
      allFids.add(Number(m.player_b_fid));
    }

    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("steal_no_steal_signups", {
      filters: { game_id: gameId },
      limit: 100,
    });

    const profileMap = new Map<number, { username: string | null; display_name: string | null; pfp_url: string | null }>();
    for (const s of signups || []) {
      profileMap.set(Number(s.fid), { username: s.username, display_name: s.display_name, pfp_url: s.pfp_url });
    }

    // Lazy-fill profiles from Neynar when cache is null (e.g. whitelist auto-signup) so UI shows names and PFP
    const needHydrate = Array.from(allFids).filter((id) => {
      const p = profileMap.get(id);
      return p && (p.username == null || p.pfp_url == null);
    });
    if (needHydrate.length > 0) {
      try {
        const client = getNeynarClient();
        const { users } = await client.fetchBulkUsers({ fids: needHydrate });
        for (const u of users || []) {
          const id = (u as { fid?: number }).fid;
          if (id != null) {
            const ur = u as { username?: string; display_name?: string; pfp_url?: string; pfp?: { url?: string } };
            profileMap.set(id, {
              username: ur.username ?? null,
              display_name: ur.display_name ?? null,
              pfp_url: ur.pfp_url ?? ur.pfp?.url ?? null,
            });
            await pokerDb.update("steal_no_steal_signups", { game_id: gameId, fid: id }, {
              username: ur.username ?? null,
              display_name: ur.display_name ?? null,
              pfp_url: (ur.pfp_url ?? ur.pfp?.url) ?? null,
              updated_at: new Date().toISOString(),
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("[steal-no-steal/games/[id]/rounds/[roundId]/matches GET] fetchBulkUsers for missing cache failed:", e);
      }
    }

    // Enrich matches with profiles
    const enrichedMatches = (matches || []).map((m) => ({
      ...m,
      playerA: { fid: m.player_a_fid, ...profileMap.get(Number(m.player_a_fid)) },
      playerB: { fid: m.player_b_fid, ...profileMap.get(Number(m.player_b_fid)) },
      winner: m.winner_fid ? { fid: m.winner_fid, ...profileMap.get(Number(m.winner_fid)) } : null,
    }));

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        roundNumber: rounds[0].round_number,
        roundStatus: rounds[0].status,
        matches: enrichedMatches,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("Register for BETR GAMES")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("[steal-no-steal/games/[id]/rounds/[roundId]/matches GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch matches" }, { status: 500 });
  }
}
