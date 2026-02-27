/**
 * GET /api/betr-guesser/games/[id]/guesses - Get all guesses for a game (admin only)
 * Uses shared profile cache then Neynar for guesser profiles.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    // Verify game exists
    const games = await pokerDb.fetch<{ id: string }>("betr_guesser_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    // Fetch all guesses for this game
    const guesses = await pokerDb.fetch<{ fid: number; guess: number; submitted_at: string }>(
      "betr_guesser_guesses",
      {
        filters: { game_id: gameId },
        order: "guess.desc", // Highest guess first
        limit: 1000,
      }
    );

    if (!guesses || guesses.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    // Hydrate user profiles: cache first, then Neynar for missing
    const fids = [...new Set(guesses.map((g) => Number(g.fid)).filter(Boolean))];
    const userMap: Record<number, CachedProfileData> = {};

    if (fids.length > 0) {
      const { cached, needFetch } = getProfilesFromCache(fids);
      Object.assign(userMap, cached);

      if (needFetch.length > 0) {
        try {
          const client = getNeynarClient();
          const { users } = await client.fetchBulkUsers({ fids: needFetch });
          const fetched: Record<number, CachedProfileData> = {};
          for (const u of users || []) {
            const id = (u as any).fid;
            if (id != null) {
              const profile: CachedProfileData = {
                username: (u as any).username,
                display_name: (u as any).display_name,
                pfp_url: (u as any).pfp_url || (u as any).pfp?.url,
              };
              userMap[id] = profile;
              fetched[id] = profile;
            }
          }
          setProfilesInCache(fetched);
        } catch (e) {
          console.warn("[betr-guesser/games/[id]/guesses] fetchBulkUsers failed:", e);
        }
      }
    }

    // Build response with hydrated user data
    const data = guesses.map((g) => {
      const user = userMap[Number(g.fid)] || {};
      return {
        fid: Number(g.fid),
        guess: g.guess,
        submitted_at: g.submitted_at,
        username: user.username ?? null,
        display_name: user.display_name ?? null,
        pfp_url: user.pfp_url ?? null,
      };
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/guesses GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch guesses" }, { status: 500 });
  }
}
