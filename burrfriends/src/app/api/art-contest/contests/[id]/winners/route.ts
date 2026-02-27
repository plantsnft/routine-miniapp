/**
 * GET /api/art-contest/contests/[id]/winners - List current winners (admin only).
 * POST /api/art-contest/contests/[id]/winners - Set 14 winners (admin only).
 * Body: { winners: [{ submissionId, position, amountDisplay? }] }.
 * Exactly 14 entries; submission IDs must refer to contest submissions; FIDs must be distinct.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const POSITIONS = 14;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
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

    const winnerRows = await pokerDb.fetch<{
      id: string;
      submission_id: string;
      fid: number;
      position: number;
      amount_display: string | null;
    }>("art_contest_winners", {
      filters: { contest_id: contestId },
      order: "position.asc",
      limit: 20,
    });

    if (!winnerRows?.length) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    const submissionIds = winnerRows.map((w) => w.submission_id);
    const subs = await pokerDb.fetch<{ id: string; title: string; image_url: string }>(
      "art_contest_submissions",
      { filters: { contest_id: contestId }, limit: 50 }
    );
    const subMap = new Map<string, { title: string; image_url: string }>();
    for (const s of subs || []) {
      subMap.set(s.id, { title: s.title, image_url: s.image_url });
    }

    const data = winnerRows.map((w) => {
      const sub = subMap.get(w.submission_id);
      return {
        id: w.id,
        submissionId: w.submission_id,
        fid: w.fid,
        position: w.position,
        amountDisplay: w.amount_display ?? null,
        title: sub?.title ?? null,
        imageUrl: sub?.image_url ?? null,
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
    console.error("[art-contest/contests/[id]/winners GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch winners" },
      { status: 500 }
    );
  }
}

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
    const contests = await pokerDb.fetch<{ id: string; status: string }>("art_contest", {
      filters: { id: contestId },
      limit: 1,
    });
    const contest = contests?.[0];
    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }
    if (contest.status !== "closed") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Contest must be closed before setting winners." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const raw = body.winners;
    if (!Array.isArray(raw) || raw.length !== POSITIONS) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Exactly ${POSITIONS} winners required.` },
        { status: 400 }
      );
    }

    const entries: { submissionId: string; position: number; amountDisplay: string | null }[] = [];
    for (let i = 0; i < raw.length; i++) {
      const e = raw[i];
      const submissionId =
        typeof e?.submissionId === "string" ? e.submissionId.trim() : String(e?.submissionId ?? "").trim();
      const position = typeof e?.position === "number" ? e.position : parseInt(String(e?.position ?? ""), 10);
      const amountDisplay =
        typeof e?.amountDisplay === "string" ? e.amountDisplay.trim() || null : null;
      if (!submissionId || position < 1 || position > POSITIONS) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Invalid entry at index ${i}: submissionId and position 1–${POSITIONS} required.` },
          { status: 400 }
        );
      }
      entries.push({ submissionId, position, amountDisplay });
    }

    const byPosition = new Map<number, (typeof entries)[0]>();
    for (const e of entries) {
      if (byPosition.has(e.position)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Duplicate position ${e.position}.` },
          { status: 400 }
        );
      }
      byPosition.set(e.position, e);
    }

    const allSubmissions = await pokerDb.fetch<{ id: string; contest_id: string; fid: number }>(
      "art_contest_submissions",
      { filters: { contest_id: contestId }, limit: 500 }
    );
    const subMap = new Map<string, { fid: number }>();
    for (const s of allSubmissions || []) {
      subMap.set(s.id, { fid: s.fid });
    }

    const seenFids = new Set<number>();
    for (let p = 1; p <= POSITIONS; p++) {
      const e = byPosition.get(p);
      if (!e) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Position ${p} is missing.` },
          { status: 400 }
        );
      }
      const sub = subMap.get(e.submissionId);
      if (!sub) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Submission ${e.submissionId} not found or not in this contest.` },
          { status: 400 }
        );
      }
      if (seenFids.has(sub.fid)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `One winner per person: FID ${sub.fid} appears more than once.` },
          { status: 400 }
        );
      }
      seenFids.add(sub.fid);
    }

    const existing = await pokerDb.fetch<{ id: string }>("art_contest_winners", {
      filters: { contest_id: contestId },
      limit: 20,
    });
    if (existing?.length) {
      for (const row of existing) {
        await pokerDb.delete("art_contest_winners", { id: (row as { id: string }).id });
      }
    }

    const toInsert = entries.map((e) => {
      const sub = subMap.get(e.submissionId)!;
      return {
        contest_id: contestId,
        submission_id: e.submissionId,
        fid: sub.fid,
        position: e.position,
        amount_display: e.amountDisplay,
      };
    });
    await pokerDb.insert("art_contest_winners", toInsert);

    return NextResponse.json<ApiResponse>({ ok: true, data: { message: "Winners saved." } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/contests/[id]/winners POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to set winners" },
      { status: 500 }
    );
  }
}
