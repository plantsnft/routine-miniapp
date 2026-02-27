/**
 * GET /api/ncaa-hoops/contests/[id]
 * Contest by id; slots (display_label, display_name); matchups (derived: matchup_id 1–63, round, slot_a_id, slot_b_id for round 1).
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getRoundForMatchup } from "~/lib/ncaaHoops";
import type { ApiResponse } from "~/lib/types";

function buildMatchups(): { matchup_id: number; round: number; slot_a_id: string; slot_b_id: string }[] {
  const matchups: { matchup_id: number; round: number; slot_a_id: string; slot_b_id: string }[] = [];
  for (let m = 1; m <= 32; m++) {
    const slotA = String((m - 1) * 2 + 1);
    const slotB = String((m - 1) * 2 + 2);
    matchups.push({ matchup_id: m, round: 1, slot_a_id: slotA, slot_b_id: slotB });
  }
  for (let m = 33; m <= 63; m++) {
    matchups.push({
      matchup_id: m,
      round: getRoundForMatchup(m),
      slot_a_id: "",
      slot_b_id: "",
    });
  }
  return matchups;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [contestRows, slotRows] = await Promise.all([
      pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
        filters: { id },
        limit: 1,
      }),
      pokerDb.fetch<{ slot_id: string; display_label: string; display_name: string | null }>("ncaa_hoops_slots", {
        filters: { contest_id: id },
        select: "slot_id,display_label,display_name",
      }),
    ]);

    const contest = contestRows?.[0] ?? null;
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const slots = (slotRows ?? []).map((s) => ({
      slot_id: s.slot_id,
      display_label: s.display_label,
      display_name: s.display_name,
    }));
    const matchups = buildMatchups();

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        ...contest,
        slots,
        matchups,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[ncaa-hoops/contests/[id] GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch contest" },
      { status: 500 }
    );
  }
}
