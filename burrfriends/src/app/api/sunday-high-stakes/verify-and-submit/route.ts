/**
 * POST /api/sunday-high-stakes/verify-and-submit
 * No body. Contest must be open and have qc_url (400 if not). When starts_at set, 400 if outside 30-min window.
 * Finds user's quote cast of reference (fetchCastsForUser, filter by parent_hash); validates image; checks 1M BETR stake; same eligibility as submit.
 * Creates submission; returns { password, clubggUrl }.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { checkUserStakeByFid } from "~/lib/staking";
import { isGlobalAdmin } from "~/lib/permissions";
import { SUNDAY_HIGH_STAKES_ALLOWLIST_FIDS } from "~/lib/constants";
import { isWithinSignupWindow } from "~/lib/sundayHighStakes";
import type { ApiResponse } from "~/lib/types";
import { randomUUID } from "crypto";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i;
const STAKE_REQUIRED = 1_000_000;

function normalizeCastUrl(u: string): string {
  return u.trim().replace(/farcaster\.xyz/g, "warpcast.com").replace(/\/+$/, "");
}

function normalizeHash(h: string | null | undefined): string {
  if (h == null || typeof h !== "string") return "";
  const hex = h.replace(/^0x/i, "").toLowerCase();
  return hex ? `0x${hex}` : "";
}

type CastEmbed = { url?: string; metadata?: { content_type?: string | null } };
type NeynarCast = {
  hash?: string;
  parent_hash?: string | null;
  embeds?: CastEmbed[];
};

function castHasImage(cast: NeynarCast): boolean {
  const embeds = (cast?.embeds || []) as CastEmbed[];
  const embedUrls = embeds.map((e) => e?.url || "").filter(Boolean);
  const hasImageByExtension = embedUrls.some((u) => IMAGE_EXT.test(u));
  const hasImageByMetadata = embeds.some((e) => {
    const ct = e?.metadata?.content_type;
    return typeof ct === "string" && ct.toLowerCase().startsWith("image/");
  });
  return hasImageByExtension || hasImageByMetadata;
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const openContests = await pokerDb.fetch<{
      id: string;
      status: string;
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
    if (!contest.qc_url || contest.qc_url.trim() === "") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "This contest does not have a QC URL set." },
        { status: 400 }
      );
    }
    if (contest.starts_at != null && !isWithinSignupWindow(contest)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Signup window has closed or has not started yet." },
        { status: 400 }
      );
    }

    const adminBypass = isGlobalAdmin(fid);
    const allowlistBypass = SUNDAY_HIGH_STAKES_ALLOWLIST_FIDS.includes(Number(fid));

    const refIdentifier = normalizeCastUrl(contest.qc_url);
    let referenceCastHash: string;
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

    const feed = await getNeynarClient().fetchCastsForUser({
      fid: Number(fid),
      limit: 100,
      includeReplies: true,
    });
    const casts = (feed as { casts?: NeynarCast[] })?.casts ?? [];
    const quoteCast = casts.find(
      (c) => normalizeHash(c.parent_hash) === referenceCastHash
    ) as NeynarCast | undefined;

    if (!quoteCast) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "No quote cast found." },
        { status: 400 }
      );
    }

    if (!castHasImage(quoteCast)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Your quote cast must contain an image." },
        { status: 400 }
      );
    }

    if (!adminBypass && !allowlistBypass) {
      const stakeResult = await checkUserStakeByFid(Number(fid), STAKE_REQUIRED, "betr");
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

    const castHash = quoteCast.hash ?? "";
    const castUrl = castHash ? `https://warpcast.com/~/casts/${castHash}` : "";

    const submissionId = randomUUID();
    await pokerDb.insert("sunday_high_stakes_submissions", [
      {
        id: submissionId,
        contest_id: contest.id,
        fid,
        cast_url: castUrl,
        title: null,
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
    console.error("[sunday-high-stakes/verify-and-submit]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to verify and submit" },
      { status: 500 }
    );
  }
}
