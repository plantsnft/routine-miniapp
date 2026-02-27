/**
 * POST /api/ncaa-hoops/contests/[id]/import-bracket – Admin: Import bracket from ESPN; fill slots with espn_team_id + display_name.
 * Body: { slots?: [{ slot_id, espn_team_id, display_name }] } or similar. Plan: "fill slots with espn_team_id + display_name".
 * Placeholder: accept array of { slot_id, espn_team_id?, display_name? } and update ncaa_hoops_slots.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: contestId } = await params;
    const contestRows = await pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
      filters: { id: contestId },
      limit: 1,
    });
    if (!contestRows?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const slots = Array.isArray(body.slots) ? body.slots : [];
    let updated = 0;
    for (const s of slots) {
      const slot_id = s.slot_id ?? s.slotId;
      const espn_team_id = s.espn_team_id ?? s.espnTeamId ?? null;
      const display_name = s.display_name ?? s.displayName ?? null;
      if (!slot_id) continue;
      const patch: Record<string, string | null> = {};
      if (espn_team_id != null) patch.espn_team_id = espn_team_id;
      if (display_name != null) patch.display_name = display_name;
      if (Object.keys(patch).length) {
        await pokerDb.update(
          "ncaa_hoops_slots",
          { contest_id: contestId, slot_id: String(slot_id) },
          patch as any
        );
      }
      updated++;
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: { updated } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[ncaa-hoops/contests/[id]/import-bracket POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to import bracket" }, { status: 500 });
  }
}
