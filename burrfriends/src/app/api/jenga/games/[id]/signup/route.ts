/**
 * POST /api/jenga/games/[id]/signup - Sign up for game
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { checkUserStakeByFid } from "~/lib/staking";
import { canPlayPreviewGame } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    // Check game exists and is in signup phase (moved before registration for Phase 29.1)
    const games = await pokerDb.fetch<{ id: string; status: string; staking_min_amount?: number | null; is_preview?: boolean; community?: string }>("jenga_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Phase 29.1: Admin preview bypass — skip registration + staking for preview games
    const adminBypass = canPlayPreviewGame(fid, game.is_preview, req);

    // Check registration (skip for admin preview bypass)
    if (!adminBypass) {
      const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
        filters: { fid },
        limit: 1,
      });

      if (!registered || registered.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
      }
    }

    if (game.status !== "signup") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Signups are closed for this game." }, { status: 400 });
    }

    // Staking check (skip for admin preview bypass)
    // Phase 36: use community-specific staking contract
    const gameCommunity = (game.community === 'minted_merch' ? 'minted_merch' : 'betr') as import('~/lib/constants').Community;
    const stakingMin = game.staking_min_amount != null ? Number(game.staking_min_amount) : 0;
    if (!adminBypass && stakingMin > 0) {
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

    // Check current signup count
    const signups = await pokerDb.fetch<{ fid: number }>("jenga_signups", {
      filters: { game_id: gameId },
      select: "fid",
      limit: 100,
    });

    const signupCount = (signups || []).length;

    if (signupCount >= 10) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is full (10 players maximum)." }, { status: 400 });
    }

    // Check if already signed up
    const existingSignup = (signups || []).find((s) => Number(s.fid) === fid);
    if (existingSignup) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already signed up for this game." }, { status: 400 });
    }

    // Sign up
    const now = new Date().toISOString();
    await pokerDb.insert("jenga_signups", [
      {
        game_id: gameId,
        fid,
        signed_up_at: now,
        updated_at: now,
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "You've signed up!",
      data: { gameId, fid },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/signup POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to sign up" }, { status: 500 });
  }
}
