/**
 * POST /api/art-contest/submit
 * Body: { castUrl, title }. Contest must be open. Eligibility: BETR registration or admin preview bypass.
 * Resolves cast via Neynar; author must equal fid; first image embed → fetch → Supabase Storage → insert.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { canPlayPreviewGame } from "~/lib/permissions";
import { uploadArtContestImage } from "~/lib/art-contest-storage";
import type { ApiResponse } from "~/lib/types";
import { randomUUID } from "crypto";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i;

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const castUrl = typeof body.castUrl === "string" ? body.castUrl.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!castUrl || !title) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "castUrl and title are required." },
        { status: 400 }
      );
    }

    const openContests = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>(
      "art_contest",
      { filters: { status: "open" }, order: "created_at.desc", limit: 1 }
    );
    const contest = openContests?.[0];
    if (!contest) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "No open contest." },
        { status: 400 }
      );
    }

    const adminBypass = canPlayPreviewGame(fid, contest.is_preview === true, req);
    if (!adminBypass) {
      const regs = await pokerDb.fetch<{ approved_at: string | null; rejected_at: string | null }>(
        "betr_games_registrations",
        { filters: { fid }, select: "approved_at,rejected_at", limit: 1 }
      );
      if (!regs?.length) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Register for BETR GAMES first." },
          { status: 403 }
        );
      }
      if (regs[0].rejected_at) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Your BETR GAMES registration was not approved." },
          { status: 403 }
        );
      }
      if (!regs[0].approved_at) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Your BETR GAMES registration is pending approval." },
          { status: 403 }
        );
      }
    }

    let identifier = castUrl;
    if (identifier.includes("farcaster.xyz")) {
      identifier = identifier.replace(/farcaster\.xyz/g, "warpcast.com");
    }
    const hashMatch = identifier.match(/(0x[a-fA-F0-9]+)/);
    const client = getNeynarClient();
    type CastData = { author?: { fid?: number }; embeds?: { url?: string }[] };
    let cast: CastData | null = null;
    try {
      const res = await client.lookupCastByHashOrWarpcastUrl({ identifier, type: "url" });
      cast = (res as { cast?: unknown })?.cast as CastData | null;
    } catch (e: unknown) {
      if (hashMatch && ((e as { response?: { status?: number } })?.response?.status ?? 0) >= 400) {
        try {
          const res = await client.lookupCastByHashOrWarpcastUrl({
            identifier: hashMatch[1],
            type: "hash",
          });
          cast = (res as { cast?: unknown })?.cast as CastData | null;
        } catch {
          // fall through
        }
      }
    }
    if (!cast) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Cast not found." }, { status: 400 });
    }

    const authorFid = cast?.author?.fid;
    if (authorFid != null && Number(authorFid) !== fid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cast must be from your account." },
        { status: 403 }
      );
    }

    const embedUrls = (cast?.embeds || []).map((e) => e?.url || "").filter(Boolean);
    const imageUrl = embedUrls.find((u) => IMAGE_EXT.test(u)) || embedUrls[0];
    if (!imageUrl) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cast must contain an image." },
        { status: 400 }
      );
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Could not fetch image from cast." },
        { status: 400 }
      );
    }
    const contentType = imageRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cast image must be a valid image." },
        { status: 400 }
      );
    }
    const arr = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arr);

    const submissionId = randomUUID();
    const publicUrl = await uploadArtContestImage(
      contest.id,
      submissionId,
      buffer,
      contentType.split(";")[0].trim() || "image/jpeg"
    );

    await pokerDb.insert("art_contest_submissions", [
      {
        id: submissionId,
        contest_id: contest.id,
        fid,
        cast_url: castUrl,
        title,
        image_url: publicUrl,
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { submissionId, message: "Submission added." },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/submit]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to submit" },
      { status: 500 }
    );
  }
}
