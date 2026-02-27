/**
 * GET /api/art-contest/status
 * Auth required. Returns: registered, approved, canSubmit, contest (active contest or null).
 * Phase 29.1: When isGlobalAdmin(fid) and contest is_preview, return registered/canSubmit true.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const [regs, contests] = await Promise.all([
      pokerDb.fetch<{ fid: number; approved_at: string | null; rejected_at: string | null }>(
        "betr_games_registrations",
        { filters: { fid }, select: "fid,approved_at,rejected_at", limit: 1 }
      ),
      pokerDb.fetch<Record<string, unknown>>("art_contest", {
        filters: { status: "open" },
        order: "created_at.desc",
        limit: 1,
      }),
    ]);

    const contest = contests?.[0] ?? null;
    const isPreview = !!(contest && contest.is_preview === true);
    const previewBypass = canPlayPreviewGame(fid, isPreview, req);
    const registered = !!(regs && regs.length > 0) || previewBypass;
    const approved =
      (registered && !!regs?.[0]?.approved_at && !regs?.[0]?.rejected_at) || previewBypass;
    const open = contest && (contest.status as string) === "open";
    const canSubmit =
      !!open &&
      ( (previewBypass && isPreview) || (!isPreview && registered && approved) );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered,
        approved,
        canSubmit: !!canSubmit,
        contest: contest
          ? {
              id: contest.id,
              title: contest.title,
              status: contest.status,
              is_preview: contest.is_preview,
            }
          : null,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/status]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to get status" },
      { status: 500 }
    );
  }
}
