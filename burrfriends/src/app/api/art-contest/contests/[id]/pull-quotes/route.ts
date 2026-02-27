/**
 * POST /api/art-contest/contests/[id]/pull-quotes
 * Admin only. Body: { sourceCastUrl? }. Fetches quote casts from Neynar; returns candidates
 * excluding already-imported for this contest. No insert.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { NEYNAR_API_KEY } from "~/lib/constants";
import type { ApiResponse } from "~/lib/types";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i;

function normalizeCastUrl(url: string): string {
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "");
  u = u.replace(/warpcast\.com/g, "farcaster.xyz");
  if (!u.startsWith("farcaster.xyz/")) u = "farcaster.xyz/" + u.replace(/^farcaster\.xyz\/?/, "");
  return "https://" + u;
}

type NeynarQuoteCast = {
  hash?: string;
  text?: string;
  author?: { fid?: number; username?: string; display_name?: string };
  embeds?: { url?: string }[];
};

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
    const contests = await pokerDb.fetch<{ id: string }>("art_contest", {
      filters: { id: contestId },
      limit: 1,
    });
    if (!contests?.[0]) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const sourceCastUrl = typeof body.sourceCastUrl === "string" ? body.sourceCastUrl.trim() : "";
    if (!sourceCastUrl) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "sourceCastUrl is required." },
        { status: 400 }
      );
    }

    const identifier = encodeURIComponent(sourceCastUrl);
    const url = `https://api.neynar.com/v2/farcaster/cast/quotes?identifier=${identifier}&type=url&limit=100`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": NEYNAR_API_KEY },
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[art-contest/pull-quotes] Neynar quotes failed:", res.status, text);
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Failed to fetch quote casts." },
        { status: 502 }
      );
    }
    const json = (await res.json()) as { casts?: NeynarQuoteCast[] };
    const casts = Array.isArray(json.casts) ? json.casts : [];

    const existing = await pokerDb.fetch<{ cast_url: string }>("art_contest_submissions", {
      filters: { contest_id: contestId },
      select: "cast_url",
      limit: 2000,
    });
    const existingNormalized = new Set((existing || []).map((r) => normalizeCastUrl(r.cast_url)));

    const candidates: {
      castUrl: string;
      fid: number;
      username: string | null;
      display_name: string | null;
      text: string;
      imageUrl: string | null;
    }[] = [];

    for (const cast of casts) {
      const author = cast.author;
      const hash = cast.hash;
      const username = author?.username;
      if (!hash || !username) continue;
      const castUrl = `https://farcaster.xyz/${username}/${hash}`;
      if (existingNormalized.has(normalizeCastUrl(castUrl))) continue;

      const embedUrls = (cast.embeds || []).map((e) => e?.url || "").filter(Boolean);
      const imageUrl = embedUrls.find((u) => IMAGE_EXT.test(u)) || embedUrls[0] || null;
      if (!imageUrl) continue;

      candidates.push({
        castUrl,
        fid: Number(author?.fid) || 0,
        username: author?.username ?? null,
        display_name: author?.display_name ?? null,
        text: typeof cast.text === "string" ? cast.text : "",
        imageUrl,
      });
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: { candidates } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/pull-quotes POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to pull quotes" },
      { status: 500 }
    );
  }
}
