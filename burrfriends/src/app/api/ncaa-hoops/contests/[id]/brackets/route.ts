/**
 * POST /api/ncaa-hoops/contests/[id]/brackets – Submit bracket.
 * Body: { picks: [{ matchup_id, winner_slot_id }] } (exactly 63, unique matchup_ids, valid slot_ids).
 * Enforce entry cap (allowedEntries). Layer 3: admin preview bypass.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import { getAllowedEntries } from "~/lib/ncaaHoops";
import { TOTAL_MATCHUPS } from "~/lib/ncaaHoops";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: contestId } = await params;

    const contestRows = await pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
      filters: { id: contestId },
      limit: 1,
    });
    const contest = contestRows?.[0] ?? null;
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const status = String(contest.status);
    if (status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Picks are closed for this contest." }, { status: 400 });
    }

    const isPreview = contest.is_preview === true;
    const adminBypass = canPlayPreviewGame(fid, isPreview, req);

    if (!adminBypass) {
      const allowedEntries = getAllowedEntries(fid, String(contest.community ?? "betr"));
      const existingBrackets = await pokerDb.fetch<{ id: string }>("ncaa_hoops_brackets", {
        filters: { contest_id: contestId, fid },
        select: "id",
      });
      const usedEntries = (existingBrackets ?? []).length;
      if (usedEntries >= allowedEntries) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Entry limit reached (${allowedEntries} per user).` },
          { status: 400 }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const picks = Array.isArray(body.picks) ? body.picks : [];
    if (picks.length !== TOTAL_MATCHUPS) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Exactly ${TOTAL_MATCHUPS} picks required.` },
        { status: 400 }
      );
    }

    const matchupIds = new Set<number>();
    for (const p of picks) {
      const mid = typeof p.matchup_id === "number" ? p.matchup_id : parseInt(String(p.matchup_id), 10);
      if (mid < 1 || mid > 63 || !Number.isInteger(mid)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Invalid matchup_id: ${p.matchup_id}` }, { status: 400 });
      }
      if (matchupIds.has(mid)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Duplicate matchup_id: ${mid}` }, { status: 400 });
      }
      matchupIds.add(mid);
    }
    if (matchupIds.size !== 63) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "All matchup_ids 1–63 must be present exactly once." }, { status: 400 });
    }

    const validSlots = await pokerDb.fetch<{ slot_id: string }>("ncaa_hoops_slots", {
      filters: { contest_id: contestId },
      select: "slot_id",
    });
    const validSlotSet = new Set((validSlots ?? []).map((s) => s.slot_id));

    const bracketInsert = await pokerDb.insert("ncaa_hoops_brackets", [
      { contest_id: contestId, fid, total_score: 0, championship_correct: false },
    ]);
    if (!bracketInsert?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create bracket" }, { status: 500 });
    }
    const bracketId = (bracketInsert[0] as unknown as { id: string }).id;

    const pickRows = picks.map((p: { matchup_id: number; winner_slot_id: string }) => {
      const winner_slot_id = String(p.winner_slot_id ?? "").trim();
      if (!validSlotSet.has(winner_slot_id)) {
        throw new Error(`Invalid winner_slot_id for matchup ${p.matchup_id}: ${winner_slot_id}`);
      }
      return { bracket_id: bracketId, matchup_id: p.matchup_id, winner_slot_id };
    });

    await pokerDb.insert("ncaa_hoops_picks", pickRows);

    return NextResponse.json<ApiResponse>({ ok: true, data: { bracketId } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (err?.message?.includes("Invalid winner_slot_id")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[ncaa-hoops/contests/[id]/brackets POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit bracket" }, { status: 500 });
  }
}
