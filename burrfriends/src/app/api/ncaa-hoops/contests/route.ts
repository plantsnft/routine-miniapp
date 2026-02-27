/**
 * POST /api/ncaa-hoops/contests – Create contest (admin only).
 * Body: title, community?, picks_close_at?, tournament_start_date?, tournament_end_date?, isPreview?.
 * Block if another contest has status in (open, picks_closed, in_progress) for that community.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const REGIONS = ["South", "East", "Midwest", "West"];

function buildPlaceholderSlots(contestId: string): { contest_id: string; slot_id: string; region: string; seed: number; round: number; display_label: string }[] {
  const rows: { contest_id: string; slot_id: string; region: string; seed: number; round: number; display_label: string }[] = [];
  let slotIndex = 0;
  for (const region of REGIONS) {
    for (let seed = 1; seed <= 16; seed++) {
      slotIndex++;
      rows.push({
        contest_id: contestId,
        slot_id: String(slotIndex),
        region,
        seed,
        round: 1,
        display_label: `${region} #${seed}`,
      });
    }
  }
  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "NCAA HOOPS Bracket";
    const community = typeof body.community === "string" && body.community.trim() ? body.community.trim() : "betr";
    const isPreview = body.isPreview === true;
    const picks_close_at = body.picks_close_at ?? null;
    const tournament_start_date = body.tournament_start_date ?? null;
    const tournament_end_date = body.tournament_end_date ?? null;

    const existing = await pokerDb.fetch<{ id: string; status: string }>("ncaa_hoops_contests", {
      filters: { community },
      select: "id,status",
      limit: 50,
    });
    const activeStatuses = ["open", "picks_closed", "in_progress"];
    const hasActive = (existing ?? []).some((r) => activeStatuses.includes(r.status));
    if (hasActive) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "An active contest already exists for this community (open, picks_closed, or in_progress)." },
        { status: 400 }
      );
    }

    const inserted = await pokerDb.insert("ncaa_hoops_contests", [
      {
        title,
        status: "open",
        is_preview: isPreview,
        created_by_fid: fid,
        community,
        picks_close_at: picks_close_at || null,
        tournament_start_date: tournament_start_date || null,
        tournament_end_date: tournament_end_date || null,
      },
    ]);

    if (!inserted?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create contest" }, { status: 500 });
    }

    const contest = inserted[0] as unknown as { id: string };
    const slots = buildPlaceholderSlots(contest.id);
    await pokerDb.insert("ncaa_hoops_slots", slots);

    return NextResponse.json<ApiResponse>({ ok: true, data: inserted[0] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[ncaa-hoops/contests POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create contest" }, { status: 500 });
  }
}
