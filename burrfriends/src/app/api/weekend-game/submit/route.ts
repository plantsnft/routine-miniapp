/**
 * POST /api/weekend-game/submit
 * Score (0-1M) + screenshot or castUrl. Requires open round; eligibility checks; higher=better.
 * Path A: image → tunnel-racer-verify (liberal). Path B: Neynar cast, author=fid, cast refs 3D Tunnel Racer/Remix, extract score.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { canPlayPreviewGame } from "~/lib/permissions";
import { extractTunnelRacerFromImage, extractTunnelRacerFromCastText } from "~/lib/tunnel-racer-verify";
import type { ApiResponse } from "~/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const LEADERBOARD_CACHE_ID = "default";
const TUNNEL_RACER_MARKERS = ["3d tunnel racer", "3D Tunnel Racer", "tunnel racer", "remix", "play.remix.gg"];

function castReferencesTunnelRacer(text: string, embedUrls: string[]): boolean {
  const combined = `${(text || "").toLowerCase()} ${(embedUrls || []).join(" ").toLowerCase()}`;
  return TUNNEL_RACER_MARKERS.some((m) => combined.includes(m.toLowerCase()));
}

function clampScore(n: number): number | null {
  if (typeof n !== "number" || isNaN(n) || n < 0 || n > 1_000_000) return null;
  return Math.floor(n);
}

async function upsertAndReturn(
  fid: number,
  score: number,
  best_cast_hash: string | null,
  best_cast_url: string | null
): Promise<{ isNewBest: boolean; rank: number | null }> {
  const existing = await pokerDb.fetch<{ fid: number; best_score: number }>("weekend_game_scores", {
    filters: { fid },
    limit: 1,
  });
  const prev = existing?.[0];
  const isNewBest = !prev || score > prev.best_score;
  const now = new Date().toISOString();
  const data = {
    best_score: score,
    best_cast_hash,
    best_cast_url,
    best_submitted_at: now,
    updated_at: now,
  };
  if (isNewBest) {
    if (prev) {
      await pokerDb.update("weekend_game_scores", { fid }, data);
    } else {
      await pokerDb.insert("weekend_game_scores", [{ fid, ...data }]);
    }
    try {
      await pokerDb.delete("weekend_game_leaderboard_cache", { id: LEADERBOARD_CACHE_ID });
    } catch (e) {
      console.warn("[weekend-game/submit] Failed to invalidate leaderboard cache:", e);
    }
  }
  const all = await pokerDb.fetch<{ fid: number }>("weekend_game_scores", {
    select: "fid",
    order: "best_score.desc",
    limit: 5000,
  });
  const rank = all.findIndex((r: { fid: number }) => r.fid === fid) + 1 || null;
  return { isNewBest, rank };
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const activeRoundsForBypass = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("weekend_game_rounds", {
      filters: { status: "open" },
      order: "created_at.desc",
      limit: 1,
    });
    const adminBypass = canPlayPreviewGame(fid, activeRoundsForBypass?.[0]?.is_preview, req);

    if (!adminBypass) {
      const [regs, tournamentRows, aliveRows] = await Promise.all([
        pokerDb.fetch<{ fid: number; approved_at: string | null; rejected_at: string | null }>(
          "betr_games_registrations",
          { filters: { fid }, select: "fid,approved_at,rejected_at", limit: 1 }
        ),
        pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", { select: "fid", limit: 1 }),
        pokerDb.fetch<{ fid: number; status: string }>("betr_games_tournament_players", {
          filters: { fid },
          select: "fid,status",
          limit: 1,
        }),
      ]);
      if (!regs || regs.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
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
      const tournamentStarted = tournamentRows != null && tournamentRows.length > 0;
      if (tournamentStarted) {
        const alive = aliveRows != null && aliveRows.length > 0 && aliveRows[0].status === "alive";
        if (!alive) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: "You are not active in BETR GAMES." },
            { status: 403 }
          );
        }
      }
    }

    const activeRounds = activeRoundsForBypass;
    if (!activeRounds || activeRounds.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "This game has been closed for submissions and the results are in process." },
        { status: 400 }
      );
    }

    let score: number;
    let castUrl: string | null = null;
    let imageFile: File | null = null;
    let imageBase64 = "";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      if (!form) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid form data." }, { status: 400 });
      }
      const scoreVal = form.get("score");
      score =
        typeof scoreVal === "string" ? parseInt(scoreVal, 10) : typeof scoreVal === "number" ? scoreVal : NaN;
      const img = form.get("image");
      imageFile = img instanceof File ? img : null;
      if (isNaN(score) || clampScore(score) === null) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Invalid score (must be 0–1,000,000)." },
          { status: 400 }
        );
      }
      if (!imageFile || imageFile.size === 0) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Provide a screenshot (image file). For cast URL, use JSON with castUrl." },
          { status: 400 }
        );
      }
      if (imageFile.size > MAX_IMAGE_BYTES) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Image too large (max 5MB)." }, { status: 400 });
      }
    } else {
      const body = await req.json().catch(() => ({}));
      const scoreVal = body.score;
      score =
        typeof scoreVal === "number" ? scoreVal : parseInt(String(scoreVal ?? ""), 10);
      castUrl = typeof body.castUrl === "string" ? body.castUrl.trim() || null : null;
      imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
      if (isNaN(score) || clampScore(score) === null) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Invalid score (must be 0–1,000,000)." },
          { status: 400 }
        );
      }
      const hasCast = !!castUrl;
      const hasImage = !!imageBase64;
      if (hasCast && hasImage) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Provide only one: screenshot or cast URL." },
          { status: 400 }
        );
      }
      if (!hasCast && !hasImage) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Provide either a screenshot or a cast URL." },
          { status: 400 }
        );
      }
    }

    let finalScore: number;
    let castHash: string | null = null;
    let castUrlStored: string | null = null;

    if (imageFile || imageBase64) {
      let buf: Buffer;
      if (imageFile) {
        buf = Buffer.from(await imageFile.arrayBuffer());
      } else {
        const b64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
        try {
          buf = Buffer.from(b64, "base64");
        } catch {
          return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid image data." }, { status: 400 });
        }
      }
      if (buf.length > MAX_IMAGE_BYTES) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Image too large (max 5MB)." }, { status: 400 });
      }
      const { score: extractedScore, is3DTunnelRacerGame } = await extractTunnelRacerFromImage(buf);
      if (!is3DTunnelRacerGame) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Image does not appear to be from 3D Tunnel Racer on Remix." },
          { status: 400 }
        );
      }
      finalScore = extractedScore != null && clampScore(extractedScore) !== null ? clampScore(extractedScore)! : clampScore(score)!;
    } else {
      let identifier = castUrl!;
      const type: "url" | "hash" = "url";
      if (identifier.includes("farcaster.xyz")) {
        identifier = identifier.replace(/farcaster\.xyz/g, "warpcast.com");
      }
      const hashMatch = identifier.match(/(0x[a-fA-F0-9]+)/);
      const client = getNeynarClient();
      type CastData = { author?: { fid?: number }; text?: string; hash?: string; embeds?: { url?: string }[] };
      let cast: CastData | null = null;
      try {
        const res = await client.lookupCastByHashOrWarpcastUrl({ identifier, type });
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
        if (!cast) {
          return NextResponse.json<ApiResponse>({ ok: false, error: "Cast not found." }, { status: 400 });
        }
      }
      const resolvedCast = cast as CastData | null;
      const authorFid = resolvedCast?.author?.fid;
      if (authorFid != null && Number(authorFid) !== fid) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Cast must be from your account." },
          { status: 400 }
        );
      }
      const text = resolvedCast?.text || "";
      const embedUrls = (resolvedCast?.embeds || []).map((e) => e?.url || "").filter(Boolean);
      if (!castReferencesTunnelRacer(text, embedUrls)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Cast must reference 3D Tunnel Racer or Remix." },
          { status: 400 }
        );
      }
      let extractedScore: number | null = null;
      const fromText = await extractTunnelRacerFromCastText(text);
      if (fromText.score != null && clampScore(fromText.score) !== null) {
        extractedScore = clampScore(fromText.score)!;
      }
      if (extractedScore == null && embedUrls.length > 0) {
        try {
          const res = await fetch(embedUrls[0]);
          const blob = await res.blob();
          const arr = await blob.arrayBuffer();
          const buf = Buffer.from(arr);
          const fromImg = await extractTunnelRacerFromImage(buf);
          if (fromImg.score != null && clampScore(fromImg.score) !== null) {
            extractedScore = clampScore(fromImg.score)!;
          }
        } catch {
          // ignore
        }
      }
      finalScore = extractedScore != null ? extractedScore : clampScore(score)!;
      castHash = resolvedCast?.hash ?? null;
      castUrlStored = castUrl;
    }

    const { isNewBest, rank } = await upsertAndReturn(fid, finalScore, castHash, castUrlStored);
    return NextResponse.json<ApiResponse>({ ok: true, data: { isNewBest, rank: rank ?? undefined, savedScore: finalScore } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/submit]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit" }, { status: 500 });
  }
}
