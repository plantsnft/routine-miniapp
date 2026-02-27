/**
 * GET /api/remix-betr/submitters
 * Admin only. Returns FIDs in both betr_games_registrations and remix_betr_scores. Optional hydration via fetchBulkUsers.
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
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const [scores, regs] = await Promise.all([
      pokerDb.fetch<{ fid: number; best_score: number; best_cast_url: string | null }>("remix_betr_scores", {
        select: "fid,best_score,best_cast_url",
        order: "best_score.desc",
        limit: 1000,
      }),
      pokerDb.fetch<{ fid: number }>("betr_games_registrations", { select: "fid", limit: 10000 }),
    ]);
    const registeredSet = new Set((regs || []).map((r: any) => Number(r.fid)));
    const submitters = (scores || []).filter((s: any) => registeredSet.has(Number(s.fid)));

    const fids = submitters.map((s: any) => Number(s.fid)).filter(Boolean);
    const userMap: Record<number, { username?: string; display_name?: string; pfp_url?: string }> = {};
    if (fids.length > 0) {
      try {
        const client = getNeynarClient();
        const { users } = await client.fetchBulkUsers({ fids });
        for (const u of users || []) {
          const id = (u as any).fid;
          if (id != null) userMap[id] = { username: (u as any).username, display_name: (u as any).display_name, pfp_url: (u as any).pfp_url || (u as any).pfp?.url };
        }
      } catch (e) {
        console.warn("[remix-betr/submitters] fetchBulkUsers failed:", e);
      }
    }

    const data = submitters.map((s: any) => ({
      fid: s.fid,
      best_score: s.best_score,
      best_cast_url: s.best_cast_url ?? null,
      username: userMap[s.fid]?.username ?? null,
      display_name: userMap[s.fid]?.display_name ?? null,
      pfp_url: userMap[s.fid]?.pfp_url ?? null,
    }));

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[remix-betr/submitters]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get submitters" }, { status: 500 });
  }
}
