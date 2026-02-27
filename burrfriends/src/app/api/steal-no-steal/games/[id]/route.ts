/**
 * GET /api/steal-no-steal/games/[id] - Get game details
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    // Get game
    const games = await pokerDb.fetch<{
      id: string;
      title: string;
      prize_amount: number;
      decision_time_seconds: number;
      status: string;
      current_round: number;
      staking_min_amount: number | null;
      min_players_to_start: number | null;
      signup_closes_at: string | null;
      start_condition: string | null;
      started_at: string | null;
      settled_at: string | null;
      settle_tx_hash: string | null;
      created_at: string;
      whitelist_fids?: number[] | null;
    }>("steal_no_steal_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Check auto-start condition
    if (game.status === "signup") {
      const signups = await pokerDb.fetch<{ fid: number }>("steal_no_steal_signups", {
        filters: { game_id: gameId },
        limit: 100,
      });
      const signupCount = signups?.length || 0;

      let shouldStart = false;
      if (game.start_condition && game.min_players_to_start) {
        const shouldStartByPlayers =
          (game.start_condition === "players" || game.start_condition === "either") &&
          signupCount >= game.min_players_to_start;

        const shouldStartByTime =
          (game.start_condition === "time" || game.start_condition === "either") &&
          !!game.signup_closes_at &&
          new Date(game.signup_closes_at).getTime() <= Date.now();

        shouldStart = shouldStartByPlayers || !!shouldStartByTime;
      }

      if (shouldStart) {
        const now = new Date().toISOString();
        await pokerDb.update("steal_no_steal_games", { id: gameId }, {
          status: "in_progress",
          started_at: now,
          updated_at: now,
        });
        game.status = "in_progress";
        game.started_at = now;
      }
    }

    // Get signup count
    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
      signed_up_at: string;
    }>("steal_no_steal_signups", {
      filters: { game_id: gameId },
      order: "signed_up_at.asc",
      limit: 100,
    });

    // Check if user is signed up
    let hasSignedUp = false;
    try {
      const { fid } = await requireAuth(req);
      hasSignedUp = signups?.some((s) => Number(s.fid) === fid) || false;
    } catch {
      // Not authed, that's fine
    }

    // Phase 17: Lazy-fill signup profile when cache is null (e.g. auto-signed up at create) so UI shows names and PFP
    let signupsToReturn: typeof signups = signups ?? [];
    if (game.status === "signup" && signups && signups.length > 0) {
      const needHydrate = signups.filter((s) => s.username == null && s.pfp_url == null);
      const userMap: Record<number, { username?: string; display_name?: string; pfp_url?: string }> = {};
      if (needHydrate.length > 0) {
        try {
          const client = getNeynarClient();
          const fids = needHydrate.map((s) => Number(s.fid)).filter(Boolean);
          const { users } = await client.fetchBulkUsers({ fids });
          for (const u of users || []) {
            const id = (u as { fid?: number }).fid;
            if (id != null) {
              const ur = u as { username?: string; display_name?: string; pfp_url?: string; pfp?: { url?: string } };
              userMap[id] = {
                username: ur.username,
                display_name: ur.display_name,
                pfp_url: ur.pfp_url ?? ur.pfp?.url,
              };
              await pokerDb.update("steal_no_steal_signups", { game_id: gameId, fid: id }, {
                username: ur.username ?? null,
                display_name: ur.display_name ?? null,
                pfp_url: (ur.pfp_url ?? ur.pfp?.url) ?? null,
                updated_at: new Date().toISOString(),
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn("[steal-no-steal/games/[id] GET] fetchBulkUsers for missing cache failed:", e);
        }
      }
      signupsToReturn = signups.map((s) => {
        const fidNum = Number(s.fid);
        const cached = { username: s.username ?? null, display_name: s.display_name ?? null, pfp_url: s.pfp_url ?? null };
        const hydrated = userMap[fidNum];
        return {
          fid: fidNum,
          signed_up_at: s.signed_up_at,
          username: (hydrated?.username ?? cached.username) ?? null,
          display_name: (hydrated?.display_name ?? cached.display_name) ?? null,
          pfp_url: (hydrated?.pfp_url ?? cached.pfp_url) ?? null,
        };
      });
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        ...game,
        signup_count: signups?.length || 0,
        signups: game.status === "signup" ? signupsToReturn : undefined,
        hasSignedUp,
      },
    });
  } catch (e: unknown) {
    console.error("[steal-no-steal/games/[id] GET]", e);
    const err = e as { message?: string };
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
