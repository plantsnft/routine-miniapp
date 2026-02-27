/**
 * POST /api/art-contest/contests/[id]/import
 * Admin only. Body: { castUrl, title?, destination: 'gallery'|'backup' }.
 * Import one quote cast: lookup cast, first image → fetch → Storage → insert with visibility.
 * Skip if already imported (return ok). Author of cast can be anyone.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { uploadArtContestImage } from "~/lib/art-contest-storage";
import type { ApiResponse } from "~/lib/types";
import { randomUUID } from "crypto";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i;

function normalizeCastUrl(url: string): string {
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "");
  u = u.replace(/warpcast\.com/g, "farcaster.xyz");
  if (!u.startsWith("farcaster.xyz/")) u = "farcaster.xyz/" + u.replace(/^farcaster\.xyz\/?/, "");
  return "https://" + u;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid: _adminFid } = await requireAuth(req);
    if (!isAdmin(_adminFid)) {
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
    const castUrl = typeof body.castUrl === "string" ? body.castUrl.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const destination = body.destination === "backup" ? "backup" : "gallery";
    if (!castUrl) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "castUrl is required." },
        { status: 400 }
      );
    }

    const normalizedInput = normalizeCastUrl(castUrl);
    const allExisting = await pokerDb.fetch<{ cast_url: string }>("art_contest_submissions", {
      filters: { contest_id: contestId },
      select: "cast_url",
      limit: 5000,
    });
    const alreadyImported = (allExisting || []).some((r) => normalizeCastUrl(r.cast_url) === normalizedInput);
    if (alreadyImported) {
      return NextResponse.json<ApiResponse>({ ok: true, data: { skipped: true, message: "Already imported." } });
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

    const authorFid = cast?.author?.fid != null ? Number(cast.author.fid) : 0;
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
      contestId,
      submissionId,
      buffer,
      contentType.split(";")[0].trim() || "image/jpeg"
    );

    const finalTitle = title || (cast as { text?: string })?.text?.slice(0, 200) || "Imported";

    await pokerDb.insert("art_contest_submissions", [
      {
        id: submissionId,
        contest_id: contestId,
        fid: authorFid,
        cast_url: castUrl,
        title: finalTitle,
        image_url: publicUrl,
        visibility: destination,
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { submissionId, message: destination === "gallery" ? "Added to gallery." : "Added to backup." },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[art-contest/import POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to import" },
      { status: 500 }
    );
  }
}
