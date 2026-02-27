/**
 * POST /api/remix-betr/submit
 * Submit a FRAMEDL BETR result with screenshot (Path A) or cast URL (Path B).
 * Body: JSON { score, castUrl? } or { score, imageBase64? }, or multipart with score + image.
 * score = attempts (1-7, where 7 = "X" / failed). Exactly one of castUrl or image. Requires betr_games_registrations.
 * 
 * Phase 12.1: Rebranded from REMIX BETR to FRAMEDL BETR
 * - Scoring inverted: lower attempts = better
 * - Honor system: proof (screenshot or cast) required, but score is user-reported (no AI verification)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const LEADERBOARD_CACHE_ID = "default";

// Phase 12.1: Inverted scoring - lower attempts = better (isNewBest when score < prev.best_score)
function upsertAndReturn(
  fid: number,
  score: number,
  best_cast_hash: string | null,
  best_cast_url: string | null
): Promise<{ isNewBest: boolean; rank: number | null }> {
  return (async () => {
    const existing = await pokerDb.fetch<{ fid: number; best_score: number }>("remix_betr_scores", { filters: { fid }, limit: 1 });
    const prev = existing?.[0];
    // Phase 12.1: Lower is better - new best if no previous OR score is less than previous best
    const isNewBest = !prev || score < prev.best_score;
    const now = new Date().toISOString();
    const data = { best_score: score, best_cast_hash, best_cast_url, best_submitted_at: now, updated_at: now };
    if (isNewBest) {
      if (prev) await pokerDb.update("remix_betr_scores", { fid }, data);
      else await pokerDb.insert("remix_betr_scores", [{ fid, ...data }]);

      // Leaderboard should only change on new personal bests.
      // Invalidate cache by deleting the row so the next /leaderboard read rebuilds.
      try {
        await pokerDb.delete("remix_betr_leaderboard_cache", { id: LEADERBOARD_CACHE_ID });
      } catch (e) {
        console.warn("[framedl-betr/submit] Failed to invalidate leaderboard cache:", e);
      }
    }
    // Phase 12.1: Sort ascending (fewer attempts = higher rank)
    const all = await pokerDb.fetch<{ fid: number }>("remix_betr_scores", { select: "fid", order: "best_score.asc", limit: 1000 });
    const rank = all.findIndex((r: any) => r.fid === fid) + 1 || null;
    return { isNewBest, rank };
  })();
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    // #region agent log
    console.log("[FRAMEDL-DEBUG] POST /submit entry", { fid });
    // #endregion

    // Phase 29.1: Check if the active round is a preview round for admin bypass
    const activeRounds = await pokerDb.fetch<{ id: string; is_preview?: boolean }>("remix_betr_rounds", {
      filters: { status: "open" },
      order: "created_at.desc",
      limit: 1,
    });
    const adminBypass = canPlayPreviewGame(fid, activeRounds?.[0]?.is_preview, req);

    // Check registration (skip for admin preview bypass)
    if (!adminBypass) {
      const registered = await pokerDb.fetch<{ fid: number; approved_at: string | null; rejected_at: string | null }>(
        "betr_games_registrations", { filters: { fid }, select: "fid,approved_at,rejected_at", limit: 1 }
      );
      if (!registered?.length) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
      }
      if (registered[0].rejected_at) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Your BETR GAMES registration was not approved." }, { status: 403 });
      }
      if (!registered[0].approved_at) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Your BETR GAMES registration is pending approval." }, { status: 403 });
      }
    }

    let score: number;
    let castUrl: string = "";
    let imageBase64: string = "";
    let imageFile: File | null = null;

    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      if (!form) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid form data." }, { status: 400 });
      }
      const scoreVal = form.get("score");
      score = typeof scoreVal === "string" ? parseInt(scoreVal, 10) : typeof scoreVal === "number" ? scoreVal : NaN;
      const img = form.get("image");
      imageFile = img instanceof File ? img : null;
      // Phase 12.1: Validate attempts range 1-7 (7 = X / failed)
      if (isNaN(score) || score < 1 || score > 7) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid attempts (must be 1-6, or X)." }, { status: 400 });
      }
      if (!imageFile || imageFile.size === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Provide a screenshot (image file). For cast URL, use JSON with castUrl." }, { status: 400 });
      }
      if (imageFile.size > MAX_IMAGE_BYTES) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Image too large (max 5MB)." }, { status: 400 });
      }
      // Path A only for multipart
    } else {
      const body = await req.json().catch(() => ({}));
      score = typeof body.score === "number" ? body.score : parseInt(String(body.score ?? ""), 10);
      castUrl = typeof body.castUrl === "string" ? body.castUrl.trim() : "";
      imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";

      // Phase 12.1: Validate attempts range 1-7 (7 = X / failed)
      if (isNaN(score) || score < 1 || score > 7) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid attempts (must be 1-6, or X)." }, { status: 400 });
      }
      const hasCast = castUrl.length > 0;
      const hasImage = imageBase64.length > 0;
      if (hasCast && hasImage) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Provide only one: screenshot or cast URL." }, { status: 400 });
      }
      if (!hasCast && !hasImage) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Provide either a screenshot or a cast URL." }, { status: 400 });
      }
    }

    // --- Path A: Screenshot ---
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

      // Honor system: image accepted as proof; score not verified against image content
      const { isNewBest, rank } = await upsertAndReturn(fid, score, null, null);
      return NextResponse.json<ApiResponse>({ ok: true, data: { isNewBest, rank: rank ?? undefined } });
    }

    // --- Path B: Cast URL (full honor system — any string accepted as proof) ---
    const { isNewBest, rank } = await upsertAndReturn(fid, score, null, castUrl || null);
    return NextResponse.json<ApiResponse>({ ok: true, data: { isNewBest, rank: rank ?? undefined } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[framedl-betr/submit]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit result" }, { status: 500 });
  }
}
