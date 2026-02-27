/**
 * GET /api/art-contest/contests/[id]/submissions - List submissions for contest (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: contestId } = await params;
    const contests = await pokerDb.fetch<{ id: string }>("art_contest", {
      filters: { id: contestId },
      limit: 1,
    });
    if (!contests?.[0]) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const submissions = await pokerDb.fetch<{
      id: string;
      contest_id: string;
      fid: number;
      cast_url: string;
      title: string;
      image_url: string;
      created_at: string;
    }>("art_contest_submissions", {
      filters: { contest_id: contestId, visibility: "gallery" },
      order: "created_at.desc",
      limit: 500,
    });

    if (!submissions?.length) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    const fids = [...new Set(submissions.map((s) => Number(s.fid)))];
    const userMap: Record<
      number,
      { username?: string | null; display_name?: string | null; pfp_url?: string | null }
    > = {};
    if (fids.length > 0) {
      try {
        const client = getNeynarClient();
        const { users } = await client.fetchBulkUsers({ fids });
        for (const u of users || []) {
          const id = (u as { fid?: number }).fid;
          if (id != null) {
            const ur = u as { username?: string; display_name?: string; pfp_url?: string; pfp?: { url?: string } };
            userMap[id] = {
              username: ur.username ?? null,
              display_name: ur.display_name ?? null,
              pfp_url: ur.pfp_url ?? ur.pfp?.url ?? null,
            };
          }
        }
      } catch (e) {
        console.warn("[art-contest/contests/[id]/submissions] fetchBulkUsers failed:", e);
      }
    }

    const data = submissions.map((s) => {
      const profile = userMap[Number(s.fid)];
      return {
        ...s,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        pfp_url: profile?.pfp_url ?? null,
      };
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/contests/[id]/submissions GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch submissions" },
      { status: 500 }
    );
  }
}
