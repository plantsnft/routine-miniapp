/**
 * GET /api/sunday-high-stakes/reference-cast
 * Optional query contestId. Returns reference cast for contest's qc_url: castUrl, text, author, images, embeds.
 * 404 if no contest, no qc_url, or cast not found. No auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i;

function normalizeCastUrl(u: string): string {
  return u.trim().replace(/farcaster\.xyz/g, "warpcast.com").replace(/\/+$/, "");
}

type CastEmbed = { url?: string; metadata?: { content_type?: string | null } };
type NeynarCast = {
  text?: string;
  author?: {
    fid?: number;
    username?: string;
    display_name?: string;
    pfp?: { url?: string };
    pfp_url?: string;
  };
  embeds?: CastEmbed[];
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contestId = searchParams.get("contestId")?.trim() ?? null;

    let contest: Record<string, unknown> | null = null;

    if (contestId) {
      const rows = await pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
        filters: { id: contestId },
        limit: 1,
      });
      contest = rows?.[0] ?? null;
    } else {
      const open = await pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
        filters: { status: "open" },
        order: "created_at.desc",
        limit: 1,
      });
      const closed = await pokerDb.fetch<Record<string, unknown>>("sunday_high_stakes", {
        filters: { status: "closed" },
        order: "created_at.desc",
        limit: 1,
      });
      const combined = [...(open || []), ...(closed || [])];
      const filtered = combined.filter((c) => c.is_preview !== true);
      contest = filtered[0] ?? null;
    }

    if (!contest) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest not found." }, { status: 404 });
    }

    const qcUrl = typeof contest.qc_url === "string" ? contest.qc_url.trim() : "";
    if (!qcUrl) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Contest has no reference cast URL." }, { status: 404 });
    }

    const identifier = normalizeCastUrl(qcUrl);
    let cast: NeynarCast;
    try {
      const refRes = await getNeynarClient().lookupCastByHashOrWarpcastUrl({
        identifier,
        type: "url",
      });
      const c = (refRes as { cast?: NeynarCast })?.cast;
      if (!c) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Reference cast not found." }, { status: 404 });
      }
      cast = c;
    } catch {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Reference cast not found." }, { status: 404 });
    }

    const embeds = (cast.embeds || []) as CastEmbed[];
    const images: string[] = [];
    const otherEmbeds: { url?: string }[] = [];
    for (const e of embeds) {
      const url = e?.url || "";
      const isImage =
        IMAGE_EXT.test(url) ||
        (typeof e?.metadata?.content_type === "string" && e.metadata.content_type.toLowerCase().startsWith("image/"));
      if (isImage && url) images.push(url);
      else if (url) otherEmbeds.push({ url });
    }

    const author = {
      fid: cast.author?.fid ?? 0,
      username: cast.author?.username ?? "",
      display_name: cast.author?.display_name ?? "",
      pfp_url: cast.author?.pfp?.url ?? cast.author?.pfp_url ?? "",
    };

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        castUrl: qcUrl,
        text: typeof cast.text === "string" ? cast.text : "",
        author,
        images,
        embeds: otherEmbeds,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[sunday-high-stakes/reference-cast GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch reference cast" },
      { status: 500 }
    );
  }
}
