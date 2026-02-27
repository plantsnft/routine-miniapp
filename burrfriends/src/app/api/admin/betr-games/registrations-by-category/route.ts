/**
 * GET /api/admin/betr-games/registrations-by-category
 * Get player list by registration category (all, approved, pending, rejected).
 * 
 * Phase 22.3: Tournament dashboard clickable stats
 * Phase 25: Added rejected category support
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "all"; // all, approved, pending, rejected

    // Fetch all registrations (including rejected_at for Phase 25)
    const allRegs = await pokerDb.fetch<{
      fid: number;
      approved_at: string | null;
      rejected_at: string | null;
    }>("betr_games_registrations", {
      select: "fid,approved_at,rejected_at",
      order: "registered_at.desc",
      limit: 1000,
    });

    if (!allRegs || allRegs.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { players: [], category },
      });
    }

    // Filter by category (Phase 25: pending excludes rejected)
    let filtered = allRegs;
    if (category === "approved") {
      filtered = allRegs.filter(r => r.approved_at !== null);
    } else if (category === "pending") {
      filtered = allRegs.filter(r => r.approved_at === null && r.rejected_at === null);
    } else if (category === "rejected") {
      filtered = allRegs.filter(r => r.rejected_at !== null);
    }

    if (filtered.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { players: [], category },
      });
    }

    // Get profiles for display names
    const fids = filtered.map(r => r.fid);
    const client = getNeynarClient();
    const profiles: Record<number, string> = {};

    try {
      // Batch in groups of 100
      for (let i = 0; i < fids.length; i += 100) {
        const batch = fids.slice(i, i + 100);
        const response = await client.fetchBulkUsers({ fids: batch });
        for (const user of response.users || []) {
          profiles[user.fid] = user.display_name || user.username || `FID ${user.fid}`;
        }
      }
    } catch {
      // Profiles optional
    }

    const players = filtered.map(r => ({
      fid: r.fid,
      display_name: profiles[r.fid] || `FID ${r.fid}`,
    }));

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { players, category },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to get registrations" },
      { status: 500 }
    );
  }
}
