/**
 * GET /api/steal-no-steal/games/[id]/signups - Get all signups (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
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
    const games = await pokerDb.fetch<{ id: string }>("steal_no_steal_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    // Get signups with profiles (cached); lazy-fill from Neynar when null so UI shows names and PFP
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

    if (!signups || signups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

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
        console.warn("[steal-no-steal/games/[id]/signups GET] fetchBulkUsers failed:", e);
      }
    }

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
    console.error("[steal-no-steal/games/[id]/signups GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch signups" }, { status: 500 });
  }
}
