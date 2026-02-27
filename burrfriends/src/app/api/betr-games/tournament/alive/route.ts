/**
 * GET /api/betr-games/tournament/alive
 * List alive tournament players (for user-facing "players remaining" modal).
 * Phase 22.10: Only when registration is closed; same source as admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const anyTournament = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
      select: "fid",
      limit: 1,
    });
    if (!anyTournament || anyTournament.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Tournament not started" },
        { status: 403 }
      );
    }

    const alivePlayers = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
      filters: { status: "alive" },
      select: "fid",
      order: "created_at.asc",
      limit: 10000,
    });

    if (!alivePlayers || alivePlayers.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { players: [] },
      });
    }

    const fids = alivePlayers.map((p) => p.fid);
    const client = getNeynarClient();
    const profiles: Record<number, { username: string; display_name: string; pfp_url: string }> = {};

    try {
      for (let i = 0; i < fids.length; i += 100) {
        const batch = fids.slice(i, i + 100);
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
      // Profiles optional
    }

    const players = alivePlayers.map((p) => ({
      fid: p.fid,
      username: profiles[p.fid]?.username ?? `fid:${p.fid}`,
      display_name: profiles[p.fid]?.display_name ?? `FID ${p.fid}`,
      pfp_url: profiles[p.fid]?.pfp_url ?? "",
    }));

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { players },
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
      { ok: false, error: "Failed to get alive players" },
      { status: 500 }
    );
  }
}
