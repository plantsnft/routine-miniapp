/**
 * POST /api/weekend-game/rounds - Create new round (admin only)
 * Body: prizeAmount, submissionsCloseAt, roundLabel. No gameDate (unlike FRAMEDL).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const community: 'betr' | 'minted_merch' = body.community === 'minted_merch' ? 'minted_merch' : 'betr';
    const prizeAmount =
      typeof body.prizeAmount === "number" ? body.prizeAmount : parseFloat(String(body.prizeAmount || ""));
    const submissionsCloseAt =
      typeof body.submissionsCloseAt === "string" ? body.submissionsCloseAt.trim() : null;
    const roundLabel = typeof body.roundLabel === "string" ? body.roundLabel.trim() : null;

    if (isNaN(prizeAmount) || prizeAmount < 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid prize amount" }, { status: 400 });
    }

    if (!submissionsCloseAt) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "submissionsCloseAt is required" }, { status: 400 });
    }

    const closeTime = new Date(submissionsCloseAt);
    if (isNaN(closeTime.getTime()) || closeTime.getTime() <= Date.now()) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "submissionsCloseAt must be a future timestamp" },
        { status: 400 }
      );
    }

    if (!roundLabel) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "roundLabel is required (for settlements and picks)." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const round = await pokerDb.insert("weekend_game_rounds", [
      {
        prize_amount: prizeAmount,
        submissions_close_at: submissionsCloseAt,
        round_label: roundLabel,
        status: "open",
        created_by_fid: fid,
        created_at: now,
        is_preview: !!body.isPreview,
        community,
      },
    ]);

    if (!round || round.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create round" }, { status: 500 });
    }

    const createdRound = round[0] as unknown as { id: string; [key: string]: unknown };

    return NextResponse.json<ApiResponse>({ ok: true, data: createdRound });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/rounds POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create round" }, { status: 500 });
  }
}
