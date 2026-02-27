/**
 * GET /api/art-contest/gallery
 * Submissions for the active contest (or ?contestId= for preview). Returns image_url, title, fid, cast_url, submitter profile.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contestId = searchParams.get("contestId");

    let contest: { id: string } | null = null;
    if (contestId) {
      const rows = await pokerDb.fetch<{ id: string }>("art_contest", {
        filters: { id: contestId },
        limit: 1,
      });
      contest = rows?.[0] ?? null;
    } else {
      // Same as GET /api/art-contest/active: only non-preview open/closed
      const open = await pokerDb.fetch<{ id: string; is_preview?: boolean }>("art_contest", {
        filters: { status: "open" },
        order: "created_at.desc",
        limit: 5,
      });
      const closed = await pokerDb.fetch<{ id: string; is_preview?: boolean }>("art_contest", {
        filters: { status: "closed" },
        order: "created_at.desc",
        limit: 5,
      });
      const combined = [...(open || []), ...(closed || [])].filter((c) => c.is_preview !== true);
      contest = combined[0] ?? null;
    }

    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
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
      filters: { contest_id: contest.id, visibility: "gallery" },
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
        console.warn("[art-contest/gallery] fetchBulkUsers failed:", e);
      }
    }

    const data = submissions.map((s) => {
      const profile = userMap[Number(s.fid)];
      return {
        id: s.id,
        contest_id: s.contest_id,
        fid: s.fid,
        cast_url: s.cast_url,
        title: s.title,
        image_url: s.image_url,
        created_at: s.created_at,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        pfp_url: profile?.pfp_url ?? null,
      };
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[art-contest/gallery GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch gallery" },
      { status: 500 }
    );
  }
}
