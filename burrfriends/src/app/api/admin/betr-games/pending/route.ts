/**
 * GET /api/admin/betr-games/pending
 * List all registrations pending admin approval.
 * 
 * Phase 22: Tournament management
 * Phase 25: Added rejected_at to query, added rejected count to stats
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

    // Get pending registrations (approved_at is null)
    const pending = await pokerDb.fetch<{
      fid: number;
      registered_at: string;
      source: string;
    }>("betr_games_registrations", {
      select: "fid,registered_at,source",
      order: "registered_at.desc",
      limit: 500,
    });

    // Filter to only pending (approved_at is null AND rejected_at is null)
    // Since pokerDb doesn't support null filters well, we fetch all and filter
    const allRegs = await pokerDb.fetch<{
      fid: number;
      registered_at: string;
      source: string;
      approved_at: string | null;
      rejected_at: string | null;
    }>("betr_games_registrations", {
      select: "fid,registered_at,source,approved_at,rejected_at",
      order: "registered_at.desc",
      limit: 1000,
    });

    // Phase 25: Pending = not approved AND not rejected
    const pendingRegs = (allRegs || []).filter(r => r.approved_at === null && r.rejected_at === null);

    // Phase 22.3 + 25: Calculate registration stats (including rejected)
    const approvedRegs = (allRegs || []).filter(r => r.approved_at !== null);
    const rejectedRegs = (allRegs || []).filter(r => r.rejected_at !== null);
    const stats = {
      totalRegistered: (allRegs || []).length,
      approved: approvedRegs.length,
      pending: pendingRegs.length,
      rejected: rejectedRegs.length,
    };

    if (pendingRegs.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { pending: [], count: 0, stats },
      });
    }

    // Get profiles for pending FIDs
    const fids = pendingRegs.map(r => r.fid);
    const client = getNeynarClient();
    const profiles: Record<number, { username: string; display_name: string; pfp_url: string }> = {};

    try {
      const response = await client.fetchBulkUsers({ fids });
      for (const user of response.users || []) {
        profiles[user.fid] = {
          username: user.username || `fid:${user.fid}`,
          display_name: user.display_name || user.username || `FID ${user.fid}`,
          pfp_url: user.pfp_url || '',
        };
      }
    } catch {
      // Profiles optional
    }

    const enriched = pendingRegs.map(r => ({
      fid: r.fid,
      registered_at: r.registered_at,
      source: r.source,
      username: profiles[r.fid]?.username || `fid:${r.fid}`,
      display_name: profiles[r.fid]?.display_name || `FID ${r.fid}`,
      pfp_url: profiles[r.fid]?.pfp_url || '',
    }));

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { pending: enriched, count: enriched.length, stats },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to get pending registrations" },
      { status: 500 }
    );
  }
}
