/**
 * POST /api/betr-guesser/submit - Submit guess (1-100)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { checkUserStakeByFid } from "~/lib/staking";
import { canPlayPreviewGame } from "~/lib/permissions";
import { maybeCloseBetrGuesserGame, MAX_BETR_GUESSER_GUESSES } from "~/lib/betr-guesser-auto-close";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const gameId = typeof body.gameId === "string" ? body.gameId.trim() : null;
    const guess = typeof body.guess === "number" ? body.guess : parseInt(String(body.guess || ""), 10);

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "gameId is required" }, { status: 400 });
    }

    if (isNaN(guess) || guess < 1 || guess > 100) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Guess must be between 1 and 100." }, { status: 400 });
    }

    // Check game exists and is open
    const games = await pokerDb.fetch<{ id: string; status: string; guesses_close_at: string; staking_min_amount?: number | null; is_preview?: boolean; community?: string; whitelist_fids?: number[] | null }>(
      "betr_guesser_games",
      {
        filters: { id: gameId },
        limit: 1,
      }
    );

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Phase 13.9: Invite-only — only whitelisted FIDs can submit; they bypass registration and staking
    const whitelist = game.whitelist_fids != null && Array.isArray(game.whitelist_fids) && game.whitelist_fids.length === 5
      ? (game.whitelist_fids as number[])
      : null;
    const isWhitelisted = whitelist != null && whitelist.includes(Number(fid));
    if (whitelist != null && !isWhitelisted) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "This game is invite-only. You are not on the list." }, { status: 403 });
    }

    // Phase 29.1/29.2: Admin or beta preview bypass — skip registration + staking for preview games
    const adminBypass = canPlayPreviewGame(fid, game.is_preview, req);

    // Check registration (skip for admin preview bypass or whitelisted)
    if (!adminBypass && !isWhitelisted) {
      const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
        filters: { fid },
        limit: 1,
      });

      if (!registered || registered.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
      }
    }

    // Auto-close if needed (time or N guesses per start_condition)
    await maybeCloseBetrGuesserGame(gameId);
    const refreshed = await pokerDb.fetch<{ status: string }>("betr_guesser_games", {
      filters: { id: gameId },
      select: "status",
      limit: 1,
    });
    if (refreshed && refreshed.length > 0 && refreshed[0].status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Guesses are closed for this game." }, { status: 400 });
    }

    const guessCount = await pokerDb.fetch<{ id: string }>("betr_guesser_guesses", {
      filters: { game_id: gameId },
      limit: MAX_BETR_GUESSER_GUESSES + 1,
    });
    if (guessCount && guessCount.length >= MAX_BETR_GUESSER_GUESSES) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is full (max 99 guesses)." }, { status: 400 });
    }

    if (game.status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Guesses are closed for this game." }, { status: 400 });
    }

    // Staking check (skip for admin preview bypass or whitelisted)
    // Phase 36: use community-specific staking contract
    const gameCommunity = (game.community === 'minted_merch' ? 'minted_merch' : 'betr') as import('~/lib/constants').Community;
    const stakingMin = game.staking_min_amount != null ? Number(game.staking_min_amount) : 0;
    if (!adminBypass && !isWhitelisted && stakingMin > 0) {
      const stakeCheck = await checkUserStakeByFid(fid, stakingMin, gameCommunity);
      const tokenLabel = gameCommunity === 'minted_merch' ? 'Minted Merch' : 'BETR';
      if (!stakeCheck.meetsRequirement) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: `Insufficient stake. Required: ${stakingMin} ${tokenLabel}, You have: ${stakeCheck.stakedAmount} ${tokenLabel}`,
            data: {
              reason: "insufficient_stake" as const,
              requiredAmount: stakingMin,
              stakedAmount: stakeCheck.stakedAmount,
            },
          },
          { status: 403 }
        );
      }
    }

    // Check if already guessed (UNIQUE constraint will also enforce this)
    const existing = await pokerDb.fetch<{ id: string }>("betr_guesser_guesses", {
      filters: { game_id: gameId, fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already submitted a guess for this game." }, { status: 400 });
    }

    // Insert guess
    const now = new Date().toISOString();
    await pokerDb.insert("betr_guesser_guesses", [
      {
        game_id: gameId,
        fid,
        guess,
        submitted_at: now,
        updated_at: now,
      },
    ]);

    await maybeCloseBetrGuesserGame(gameId);

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: `Your guess of ${guess} has been submitted`,
      data: { guess },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("UNIQUE")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already submitted a guess for this game." }, { status: 400 });
    }
    console.error("[betr-guesser/submit POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit guess" }, { status: 500 });
  }
}
