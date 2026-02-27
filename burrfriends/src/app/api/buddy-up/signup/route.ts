/**
 * POST /api/buddy-up/signup - Sign up for game
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { checkUserStakeByFid } from "~/lib/staking";
import { canPlayPreviewGame } from "~/lib/permissions";
import { checkAndAutoStartBuddyUpGame, MAX_SIGNUPS } from "~/lib/betr-games-auto-start";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const gameId = typeof body.gameId === "string" ? body.gameId.trim() : null;

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "gameId is required" }, { status: 400 });
    }

    // Check game exists and is in signup phase
    const games = await pokerDb.fetch<{ id: string; status: string; staking_min_amount?: number | null; is_preview?: boolean; community?: string }>(
      "buddy_up_games",
      {
        filters: { id: gameId },
        limit: 1,
      }
    );

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

    // Max 99 signups per game (Phase 14)
    const signupRows = await pokerDb.fetch<{ id: string }>("buddy_up_signups", {
      filters: { game_id: gameId },
      limit: MAX_SIGNUPS + 1,
    });
    if (signupRows && signupRows.length >= MAX_SIGNUPS) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is full (max 99 players)." }, { status: 400 });
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

    // Check if already signed up (UNIQUE constraint will also enforce this)
    const existing = await pokerDb.fetch<{ id: string }>("buddy_up_signups", {
      filters: { game_id: gameId, fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already signed up for this game." }, { status: 400 });
    }

    // Insert signup
    const now = new Date().toISOString();
    await pokerDb.insert("buddy_up_signups", [
      {
        game_id: gameId,
        fid,
        signed_up_at: now,
        updated_at: now,
      },
    ]);

    // Cache profile at signup (10.3.5 optimization) so GET game doesn't need Neynar
    try {
      const client = getNeynarClient();
      const { users } = await client.fetchBulkUsers({ fids: [fid] });
      const u = users?.[0] as { username?: string; display_name?: string; pfp_url?: string; pfp?: { url?: string } } | undefined;
      if (u) {
        await pokerDb.update(
          "buddy_up_signups",
          { game_id: gameId, fid },
          {
            username: u.username ?? null,
            display_name: u.display_name ?? null,
            pfp_url: u.pfp_url ?? u.pfp?.url ?? null,
            updated_at: now,
          }
        );
      }
    } catch (e) {
      console.warn("[buddy-up/signup] cache profile failed:", e);
    }

    await checkAndAutoStartBuddyUpGame(gameId);

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "You've signed up!",
      data: { gameId },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("UNIQUE")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already signed up for this game." }, { status: 400 });
    }
    console.error("[buddy-up/signup POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to sign up" }, { status: 500 });
  }
}
