/**
 * POST /api/nl-holdem/games/[id]/join - Join game (sign up).
 * Enforces registration, staking, optional password. Layer 3: admin preview bypass.
 * Phase 40.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { checkUserStakeByFid } from "~/lib/staking";
import { canPlayPreviewGame } from "~/lib/permissions";
import { startGameWhenFull } from "~/lib/nlHoldemStart";
import { initPlayForGame } from "~/lib/nlHoldemPlay";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      staking_min_amount?: number | null;
      game_password?: string | null;
      max_participants: number;
      is_preview?: boolean;
      community?: string;
    }>("nl_holdem_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Signups are closed for this game." }, { status: 400 });
    }

    const adminBypass = canPlayPreviewGame(fid, game.is_preview, req);

    if (!adminBypass) {
      const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
        filters: { fid },
        limit: 1,
      });
      if (!registered || registered.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
      }
    }

    const stakingMin = game.staking_min_amount != null ? Number(game.staking_min_amount) : 0;
    if (!adminBypass && stakingMin > 0) {
      const gameCommunity = (game.community === "minted_merch" ? "minted_merch" : "betr") as import("~/lib/constants").Community;
      const stakeCheck = await checkUserStakeByFid(fid, stakingMin, gameCommunity);
      const tokenLabel = gameCommunity === "minted_merch" ? "Minted Merch" : "BETR";
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

    if (game.game_password && game.game_password.trim()) {
      const body = await req.json().catch(() => ({}));
      const password = typeof body.password === "string" ? body.password.trim() : "";
      if (!adminBypass && password !== game.game_password) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid game password." }, { status: 403 });
      }
    }

    const signups = await pokerDb.fetch<{ fid: number }>("nl_holdem_signups", {
      filters: { game_id: gameId },
      select: "fid",
      limit: 20,
    });
    const count = (signups || []).length;
    if (count >= game.max_participants) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is full." }, { status: 400 });
    }
    const already = (signups || []).some((s) => Number(s.fid) === fid);
    if (already) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You have already joined this game." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await pokerDb.insert("nl_holdem_signups", [
      { game_id: gameId, fid, joined_at: now },
    ]);

    const signupsAfter = await pokerDb.fetch<{ fid: number }>("nl_holdem_signups", {
      filters: { game_id: gameId },
      select: "fid",
      limit: 20,
    });
    const signupFidsAfter = (signupsAfter || []).map((s) => Number(s.fid));
    if (signupFidsAfter.length >= game.max_participants) {
      const seatOrderFids = await startGameWhenFull(gameId, signupFidsAfter, game.is_preview === true);
      if (seatOrderFids) {
        await initPlayForGame(gameId);
      }
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: { gameId, joined: true } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[nl-holdem/games/[id]/join POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to join" }, { status: 500 });
  }
}
