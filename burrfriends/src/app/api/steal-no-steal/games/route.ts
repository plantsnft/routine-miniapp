/**
 * POST /api/steal-no-steal/games - Create new game (admin only)
 * GET /api/steal-no-steal/games - List all games
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const community: 'betr' | 'minted_merch' = body.community === 'minted_merch' ? 'minted_merch' : 'betr';
    const isPreview = body.isPreview === true;
    const prizeAmount = parseFloat(String(body.prizeAmount || "0"));
    const decisionTimeSeconds = parseInt(String(body.decisionTimeSeconds || "600"), 10);
    // Phase 17.1: Decision window after negotiation ends (default 5 min)
    const decisionWindowSeconds = parseInt(String(body.decisionWindowSeconds || "300"), 10);
    const stakingMinAmount = body.stakingMinAmount ? parseFloat(String(body.stakingMinAmount)) : null;
    const minPlayersToStart = body.minPlayersToStart ? parseInt(String(body.minPlayersToStart), 10) : null;
    const signupClosesAt = body.signupClosesAt ? new Date(body.signupClosesAt).toISOString() : null;
    const startCondition = body.startCondition || null;

    if (isNaN(prizeAmount) || prizeAmount <= 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "prizeAmount must be positive" }, { status: 400 });
    }

    // Phase 17 special: allow 0–86400 (24h) for negotiation; 60–86400 for decision window
    if (isNaN(decisionTimeSeconds) || decisionTimeSeconds < 0 || decisionTimeSeconds > 86400) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "decisionTimeSeconds must be between 0 and 86400" }, { status: 400 });
    }

    if (isNaN(decisionWindowSeconds) || decisionWindowSeconds < 60 || decisionWindowSeconds > 86400) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "decisionWindowSeconds must be between 60 and 86400" }, { status: 400 });
    }

    // Validate start conditions
    if (startCondition && !["players", "time", "either"].includes(startCondition)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid startCondition" }, { status: 400 });
    }

    if ((startCondition === "time" || startCondition === "either") && signupClosesAt) {
      if (new Date(signupClosesAt).getTime() <= Date.now()) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "signupClosesAt must be in the future" }, { status: 400 });
      }
    }

    // Optional invite-only: 1–99 FIDs
    let whitelist_fids: number[] | null = null;
    if (Array.isArray(body.whitelistFids) && body.whitelistFids.length >= 1 && body.whitelistFids.length <= 99) {
      const parsed = body.whitelistFids.map((x: unknown) =>
        typeof x === "number" && Number.isInteger(x) ? x : parseInt(String(x), 10)
      ).filter((n: number) => !isNaN(n) && n > 0);
      if (parsed.length === body.whitelistFids.length) {
        whitelist_fids = parsed;
      }
    }
    if (body.whitelistFids != null && !Array.isArray(body.whitelistFids)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "whitelistFids must be an array of 1–99 FIDs" }, { status: 400 });
    }
    if (Array.isArray(body.whitelistFids) && (body.whitelistFids.length < 1 || body.whitelistFids.length > 99)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "whitelistFids must contain between 1 and 99 FIDs" }, { status: 400 });
    }

    // Optional title (Phase 17.7: "HEADS UP Steal or No Steal" for HEADS UP variant)
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "STEAL OR NO STEAL";

    const now = new Date().toISOString();
    const game = await pokerDb.insert(
      "steal_no_steal_games",
      [
        {
          title,
          prize_amount: prizeAmount,
          decision_time_seconds: decisionTimeSeconds,
          decision_window_seconds: decisionWindowSeconds, // Phase 17.1
          staking_min_amount: stakingMinAmount,
          min_players_to_start: minPlayersToStart,
          signup_closes_at: signupClosesAt,
          start_condition: startCondition,
          status: "signup",
          current_round: 1,
          created_by_fid: fid,
          created_at: now,
          updated_at: now,
          community,
          is_preview: isPreview,
          ...(whitelist_fids != null && { whitelist_fids }),
        },
      ],
      "id, title, prize_amount, decision_time_seconds, decision_window_seconds, status"
    );

    if (!game || game.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create game" }, { status: 500 });
    }

    const gameId = (game[0] as unknown as { id: string }).id;

    // Phase 17: Invite-only auto-signup — insert one row per whitelisted FID (profile cache lazy)
    if (whitelist_fids != null && whitelist_fids.length >= 1) {
      const signupRows = whitelist_fids.map((f) => ({
        game_id: gameId,
        fid: f,
        signed_up_at: now,
        updated_at: now,
      }));
      await pokerDb.insert("steal_no_steal_signups", signupRows);

      // Auto-start check (same logic as signup route)
      if (startCondition && minPlayersToStart != null) {
        const shouldStartByPlayers =
          (startCondition === "players" || startCondition === "either") &&
          whitelist_fids.length >= minPlayersToStart;
        const shouldStartByTime =
          (startCondition === "time" || startCondition === "either") &&
          signupClosesAt != null &&
          new Date(signupClosesAt).getTime() <= Date.now();
        if (shouldStartByPlayers || shouldStartByTime) {
          await pokerDb.update("steal_no_steal_games", { id: gameId }, {
            status: "in_progress",
            started_at: now,
            updated_at: now,
          });
        }
      }
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: game[0] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const games = await pokerDb.fetch(
      "steal_no_steal_games",
      {
        select: "id, title, prize_amount, decision_time_seconds, decision_window_seconds, status, current_round, staking_min_amount, min_players_to_start, signup_closes_at, start_condition, started_at, settled_at, created_at",
        order: "created_at.desc",
        limit: 100,
      }
    );

    return NextResponse.json<ApiResponse>({ ok: true, data: games || [] });
  } catch (e: unknown) {
    console.error("[steal-no-steal/games GET]", e);
    const err = e as { message?: string };
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch games" }, { status: 500 });
  }
}
