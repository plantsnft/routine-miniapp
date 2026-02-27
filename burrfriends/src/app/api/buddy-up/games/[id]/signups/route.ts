/**
 * GET /api/buddy-up/games/[id]/signups - Get all signups for a game (admin only)
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.3):
 * Uses cached profile columns (username, display_name, pfp_url) from DB.
 * Only calls Neynar for rows missing cache, then updates DB for future requests.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

interface SignupRow {
  fid: number;
  signed_up_at: string;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
}

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
    const games = await pokerDb.fetch<{ id: string }>("buddy_up_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    // Fetch all signups for this game (including cached profile columns)
    const signups = await pokerDb.fetch<SignupRow>(
      "buddy_up_signups",
      {
        filters: { game_id: gameId },
        order: "signed_up_at.asc",
        limit: 1000,
      }
    );

    if (!signups || signups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    // Find rows missing cached profile (username and pfp_url both null)
    const needHydrate = signups.filter((s) => s.username == null && s.pfp_url == null);
    const userMap: Record<number, { username?: string; display_name?: string; pfp_url?: string }> = {};

    // Only call Neynar for rows missing cache
    if (needHydrate.length > 0) {
      try {
        const client = getNeynarClient();
        const fids = needHydrate.map((s) => Number(s.fid)).filter(Boolean);
        const { users } = await client.fetchBulkUsers({ fids });
        for (const u of users || []) {
          const id = (u as any).fid;
          if (id != null) {
            userMap[id] = {
              username: (u as any).username,
              display_name: (u as any).display_name,
              pfp_url: (u as any).pfp_url || (u as any).pfp?.url,
            };
            // Update DB cache for next request (non-blocking)
            pokerDb.update("buddy_up_signups", { game_id: gameId, fid: id }, {
              username: (u as any).username ?? null,
              display_name: (u as any).display_name ?? null,
              pfp_url: ((u as any).pfp_url || (u as any).pfp?.url) ?? null,
              updated_at: new Date().toISOString(),
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("[buddy-up/games/[id]/signups] fetchBulkUsers failed:", e);
      }
    }

    // Build response: use cached profile from DB, or hydrated from Neynar
    const data = signups.map((s) => {
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

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/signups GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch signups" }, { status: 500 });
  }
}
