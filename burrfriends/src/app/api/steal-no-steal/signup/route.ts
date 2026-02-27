/**
 * POST /api/steal-no-steal/signup - Sign up for a game
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const gameId = body.gameId;

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "gameId is required" }, { status: 400 });
    }

    // Get game (moved before registration for Phase 29.1)
    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      staking_min_amount: number | null;
      min_players_to_start: number | null;
      signup_closes_at: string | null;
      start_condition: string | null;
      is_preview?: boolean;
      whitelist_fids?: number[] | null;
    }>("steal_no_steal_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Phase 17: Invite-only — only whitelisted FIDs can sign up; they bypass registration and staking
    const whitelist = game.whitelist_fids != null && Array.isArray(game.whitelist_fids) &&
      game.whitelist_fids.length >= 1 && game.whitelist_fids.length <= 99
      ? (game.whitelist_fids as number[])
      : null;
    const isWhitelisted = whitelist != null && whitelist.includes(Number(fid));
    if (whitelist != null && !isWhitelisted) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "This game is invite-only. You are not on the list." }, { status: 403 });
    }

    // Phase 29.1: Admin preview bypass — skip registration for preview games
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

    if (game.status !== "signup") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Signups are closed for this game" }, { status: 400 });
    }

    // Get current signup count (fetch + length for reliability)
    const signupRows = await pokerDb.fetch<{ fid: number }>("steal_no_steal_signups", {
      filters: { game_id: gameId },
      limit: 100,
    });
    const currentCount = signupRows?.length ?? 0;
    const maxSignups = whitelist != null ? whitelist.length : 99;

    // Phase 17: Invite-only auto-signup — if whitelisted and already in signups, return 200 (idempotent)
    if (whitelist != null && isWhitelisted && signupRows?.some((s) => Number(s.fid) === fid)) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        message: "You're already signed up.",
        data: { autoStarted: false },
      }, { status: 200 });
    }

    if (currentCount >= maxSignups) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is full." }, { status: 400 });
    }

    // TODO: Check staking requirement if staking_min_amount is set

    // Fetch user profile from Neynar
    let username: string | null = null;
    let displayName: string | null = null;
    let pfpUrl: string | null = null;

    try {
      const neynar = getNeynarClient();
      const users = await neynar.fetchBulkUsers({ fids: [fid] });
      if (users?.users?.[0]) {
        const user = users.users[0];
        username = user.username || null;
        displayName = user.display_name || null;
        pfpUrl = user.pfp_url || null;
      }
    } catch (e) {
      console.error("[steal-no-steal/signup] Neynar profile fetch failed:", e);
    }

    // Insert signup
    const now = new Date().toISOString();
    try {
      await pokerDb.insert("steal_no_steal_signups", [
        {
          game_id: gameId,
          fid,
          username,
          display_name: displayName,
          pfp_url: pfpUrl,
          signed_up_at: now,
          updated_at: now,
        },
      ]);
    } catch (e: unknown) {
      const err = e as { message?: string };
      if (err?.message?.includes("duplicate") || err?.message?.includes("unique")) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "You have already signed up for this game" }, { status: 400 });
      }
      throw e;
    }

    // Check auto-start condition
    const newSignupCount = currentCount + 1;
    let autoStarted = false;

    if (game.start_condition && game.min_players_to_start) {
      const shouldStartByPlayers =
        (game.start_condition === "players" || game.start_condition === "either") &&
        newSignupCount >= game.min_players_to_start;

      const shouldStartByTime =
        (game.start_condition === "time" || game.start_condition === "either") &&
        game.signup_closes_at &&
        new Date(game.signup_closes_at).getTime() <= Date.now();

      if (shouldStartByPlayers || shouldStartByTime) {
        await pokerDb.update("steal_no_steal_games", { id: gameId }, {
          status: "in_progress",
          started_at: now,
          updated_at: now,
        });
        autoStarted = true;
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: autoStarted ? "You've signed up! Game has started." : "You've signed up!",
      data: { autoStarted },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("Register for BETR GAMES")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("[steal-no-steal/signup POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to sign up" }, { status: 500 });
  }
}
