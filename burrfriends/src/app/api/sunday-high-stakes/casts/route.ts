/**
 * GET /api/sunday-high-stakes/casts
 * Submissions for the active contest (or ?contestId= for preview). Returns cast_url, title, fid, submitter name.
 * "Show the cast the person made" — no stored images.
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
      const rows = await pokerDb.fetch<{ id: string }>("sunday_high_stakes", {
        filters: { id: contestId },
        limit: 1,
      });
      contest = rows?.[0] ?? null;
    } else {
      const open = await pokerDb.fetch<{ id: string; is_preview?: boolean }>("sunday_high_stakes", {
        filters: { status: "open" },
        order: "created_at.desc",
        limit: 5,
      });
      const closed = await pokerDb.fetch<{ id: string; is_preview?: boolean }>("sunday_high_stakes", {
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
      title: string | null;
      created_at: string;
    }>("sunday_high_stakes_submissions", {
      filters: { contest_id: contest.id },
      order: "created_at.desc",
      limit: 500,
    });

    if (!submissions?.length) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    const fids = [...new Set(submissions.map((s) => Number(s.fid)))];
    const userMap: Record<
      number,
      { username?: string | null; display_name?: string | null }
    > = {};
    if (fids.length > 0) {
      try {
        const client = getNeynarClient();
        const { users } = await client.fetchBulkUsers({ fids });
        for (const u of users || []) {
          const id = (u as { fid?: number }).fid;
          if (id != null) {
            const ur = u as { username?: string; display_name?: string };
            userMap[id] = {
              username: ur.username ?? null,
              display_name: ur.display_name ?? null,
            };
          }
        }
      } catch (e) {
        console.warn("[sunday-high-stakes/casts] fetchBulkUsers failed:", e);
      }
    }

    const data = submissions.map((s) => {
      const profile = userMap[Number(s.fid)];
      const name = profile?.display_name || profile?.username || `FID ${s.fid}`;
      return {
        id: s.id,
        contest_id: s.contest_id,
        fid: s.fid,
        cast_url: s.cast_url,
        title: s.title,
        created_at: s.created_at,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        name,
      };
    });

    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[sunday-high-stakes/casts GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch casts" },
      { status: 500 }
    );
  }
}
