/**
 * GET /api/ncaa-hoops/status
 * Auth required. Returns: registered (Layer 2: true when isGlobalAdmin), allowedEntries, usedEntries, activeContest.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import { getAllowedEntries } from "~/lib/ncaaHoops";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const registered = isGlobalAdmin(fid);

    const [contests, brackets] = await Promise.all([
      pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
        filters: { community: "betr" },
        order: "created_at.desc",
        limit: 5,
      }),
      fid
        ? pokerDb.fetch<{ contest_id: string }>("ncaa_hoops_brackets", {
            filters: { fid },
            select: "contest_id",
            limit: 100,
          })
        : Promise.resolve([]),
    ]);

    const activeStatuses = ["open", "picks_closed", "in_progress"];
    const activeContest = (contests ?? []).find(
      (c) => activeStatuses.includes(String(c.status)) && c.is_preview !== true
    ) ?? null;

    const community = "betr";
    const allowedEntries = getAllowedEntries(fid, community);
    const usedEntries = activeContest && fid
      ? (brackets ?? []).filter((b) => b.contest_id === (activeContest.id as string)).length
      : 0;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered: !!registered,
        allowedEntries,
        usedEntries,
        activeContest: activeContest
          ? {
              id: activeContest.id,
              title: activeContest.title,
              status: activeContest.status,
              is_preview: activeContest.is_preview,
              picks_close_at: activeContest.picks_close_at,
            }
          : null,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[ncaa-hoops/status]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get status" }, { status: 500 });
  }
}
