/**
 * POST /api/sunday-high-stakes/submit
 * Body: { castUrl, title? }. Contest must be open. Eligibility: 1M BETR staked, admin, or FID in SUNDAY_HIGH_STAKES_ALLOWLIST_FIDS.
 * Validates cast via Neynar (author = fid, must have image). Image: any embed URL with image file extension (.jpg etc.) or Neynar embed metadata content_type image/*. Does NOT store image; inserts submission only.
 * Returns { password, clubggUrl } so client can show password + Club GG button. 403 with stakedAmount when stake not met.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { isGlobalAdmin } from "~/lib/permissions";
import { hasBetaAccess } from "~/lib/beta";
import { SUNDAY_HIGH_STAKES_ALLOWLIST_FIDS } from "~/lib/constants";
import { isWithinSignupWindow } from "~/lib/sundayHighStakes";
import { checkUserStakeByFid } from "~/lib/staking";
import type { ApiResponse } from "~/lib/types";
import { randomUUID } from "crypto";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i;

function normalizeCastUrl(u: string): string {
  return u.trim().replace(/farcaster\.xyz/g, "warpcast.com").replace(/\/+$/, "");
}

function normalizeHash(h: string | null | undefined): string {
  if (h == null || typeof h !== "string") return "";
  const hex = h.replace(/^0x/i, "").toLowerCase();
  return hex ? `0x${hex}` : "";
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const castUrl = typeof body.castUrl === "string" ? body.castUrl.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : null;
    if (!castUrl) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "castUrl is required." },
        { status: 400 }
      );
    }

    const openContests = await pokerDb.fetch<{
      id: string;
      status: string;
      is_preview?: boolean;
      password: string;
      clubgg_url: string;
      qc_url?: string | null;
      starts_at?: string | null;
    }>("sunday_high_stakes", {
      filters: { status: "open" },
      order: "created_at.desc",
      limit: 1,
    });
    const contest = openContests?.[0];
    if (!contest) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "No open contest." },
        { status: 400 }
      );
    }
    if (contest.starts_at != null && !isWithinSignupWindow(contest)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Signup window has closed or has not started yet." },
        { status: 400 }
      );
    }

    const adminBypass = isGlobalAdmin(fid) || (hasBetaAccess(req) && contest.is_preview === true);
    const allowlistBypass = SUNDAY_HIGH_STAKES_ALLOWLIST_FIDS.includes(Number(fid));
    if (!adminBypass && !allowlistBypass) {
      const stakeResult = await checkUserStakeByFid(Number(fid), 1_000_000, "betr");
      if (!stakeResult.meetsRequirement) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: `You need at least 1,000,000 BETR staked. Your staked amount: ${stakeResult.stakedAmount}.`,
          },
          { status: 403 }
        );
      }
    }

    let referenceCastHash: string | null = null;
    if (contest.qc_url != null && contest.qc_url.trim() !== "") {
      const refIdentifier = normalizeCastUrl(contest.qc_url);
      try {
        const refRes = await getNeynarClient().lookupCastByHashOrWarpcastUrl({
          identifier: refIdentifier,
          type: "url",
        });
        const refCast = (refRes as { cast?: { hash?: string } })?.cast;
        if (!refCast?.hash) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: "QC reference cast not found." },
            { status: 400 }
          );
        }
        referenceCastHash = normalizeHash(refCast.hash);
      } catch {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "QC reference cast not found." },
          { status: 400 }
        );
      }
    }

    const client = getNeynarClient();
    let identifier = castUrl;
    if (identifier.includes("farcaster.xyz")) {
      identifier = identifier.replace(/farcaster\.xyz/g, "warpcast.com");
    }
    const hashMatch = identifier.match(/(0x[a-fA-F0-9]+)/);
    type CastEmbed = { url?: string; metadata?: { content_type?: string | null } };
    type CastData = {
      author?: { fid?: number };
      embeds?: CastEmbed[];
      hash?: string;
      parent_hash?: string | null;
    };
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

    if (referenceCastHash != null) {
      const submittedParentHash = normalizeHash(cast.parent_hash);
      if (!submittedParentHash || submittedParentHash !== referenceCastHash) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Your cast must be a quote of the required reference cast." },
          { status: 400 }
        );
      }
    }

    const authorFid = cast?.author?.fid;
    if (authorFid != null && Number(authorFid) !== fid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cast must be from your account." },
        { status: 403 }
      );
    }

    const embeds = (cast?.embeds || []) as CastEmbed[];
    const embedUrls = embeds.map((e) => e?.url || "").filter(Boolean);
    const hasImageByExtension = embedUrls.some((u) => IMAGE_EXT.test(u));
    const hasImageByMetadata = embeds.some((e) => {
      const ct = e?.metadata?.content_type;
      return typeof ct === "string" && ct.toLowerCase().startsWith("image/");
    });
    const hasImage = hasImageByExtension || hasImageByMetadata;
    if (!hasImage) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cast must contain an image." },
        { status: 400 }
      );
    }

    const submissionId = randomUUID();
    await pokerDb.insert("sunday_high_stakes_submissions", [
      {
        id: submissionId,
        contest_id: contest.id,
        fid,
        cast_url: castUrl,
        title: title || null,
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        submissionId,
        message: "Submission received. Use the password below to join on Club GG.",
        password: contest.password,
        clubggUrl: contest.clubgg_url,
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
    console.error("[sunday-high-stakes/submit]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to submit" },
      { status: 500 }
    );
  }
}
