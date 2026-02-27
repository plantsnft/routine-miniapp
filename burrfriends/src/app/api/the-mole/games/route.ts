/**
 * POST /api/the-mole/games - Create new game (admin only)
 * GET /api/the-mole/games - List all games
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const community: 'betr' | 'minted_merch' = body.community === 'minted_merch' ? 'minted_merch' : 'betr';
    const eligiblePlayersSource = body.eligiblePlayersSource === 'tournament_alive' ? 'tournament_alive' as const : null;
    const prizeAmount = typeof body.prizeAmount === "number" ? body.prizeAmount : parseFloat(String(body.prizeAmount || ""));
    const stakingMinAmount = typeof body.stakingMinAmount === "number" ? body.stakingMinAmount : (body.stakingMinAmount != null ? parseFloat(String(body.stakingMinAmount)) : null);
    const minPlayersToStart = body.minPlayersToStart != null ? Number(body.minPlayersToStart) : null;
    const signupClosesAtRaw = typeof body.signupClosesAt === "string" ? body.signupClosesAt.trim() || null : null;
    const startCondition = typeof body.startCondition === "string" && ["min_players", "at_time", "whichever_first"].includes(body.startCondition) ? body.startCondition : null;

    if (isNaN(prizeAmount) || prizeAmount <= 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid prize amount" }, { status: 400 });
    }

    if (stakingMinAmount != null && !isNaN(stakingMinAmount) && stakingMinAmount > 0) {
      const { isValidStakingThreshold, VALID_STAKING_THRESHOLDS } = await import('~/lib/constants');
      if (!isValidStakingThreshold(stakingMinAmount)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Invalid staking_min_amount: ${stakingMinAmount}. Must be one of: ${VALID_STAKING_THRESHOLDS.map(t => `${t / 1_000_000}M`).join(', ')} BETR or null/0 for no requirement` },
          { status: 400 }
        );
      }
    }

    const nowDate = new Date();
    const now = nowDate.toISOString();
    // Defaults for THE MOLE: 5 players, 30 min from creation, whichever first
    let signup_closes_at: string | null = signupClosesAtRaw;
    let min_players_to_start: number | null = minPlayersToStart != null && !isNaN(minPlayersToStart) ? minPlayersToStart : 5;
    const start_condition: string | null = startCondition ?? "whichever_first";
    if (start_condition === "at_time" || start_condition === "whichever_first") {
      if (signup_closes_at) {
        const t = new Date(signup_closes_at).getTime();
        if (isNaN(t) || t <= nowDate.getTime()) {
          return NextResponse.json<ApiResponse>({ ok: false, error: "signupClosesAt must be a future date/time" }, { status: 400 });
        }
      } else {
        const thirtyMin = new Date(nowDate.getTime() + 30 * 60 * 1000).toISOString();
        signup_closes_at = thirtyMin;
      }
    }
    if (start_condition === "min_players" || start_condition === "whichever_first") {
      if (min_players_to_start == null || min_players_to_start < 1) min_players_to_start = 5;
    }

    const game = await pokerDb.insert("mole_games", [
      {
        title: "THE MOLE",
        prize_amount: prizeAmount,
        staking_min_amount: stakingMinAmount != null && !isNaN(stakingMinAmount) ? stakingMinAmount : null,
        status: "signup",
        current_round: 1,
        created_by_fid: fid,
        created_at: now,
        updated_at: now,
        min_players_to_start: min_players_to_start ?? null,
        signup_closes_at: signup_closes_at ?? null,
        start_condition: start_condition ?? null,
        community,
        eligible_players_source: eligiblePlayersSource,
      },
    ]);

    if (!game || game.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create game" }, { status: 500 });
    }

    const createdGame = game[0] as unknown as { id: string; [key: string]: unknown };

    let pendingNotifications: Awaited<ReturnType<typeof import("~/lib/notifications").prepareGameCreationNotification>> = null;

    if (process.env.ENABLE_PUSH_NOTIFICATIONS === "true") {
      try {
        const { prepareGameCreationNotification } = await import("~/lib/notifications");
        const { APP_URL } = await import("~/lib/constants");

        safeLog("info", "[the-mole/games] Preparing game creation notification", {
          gameId: createdGame.id,
          prizeAmount,
        });

        pendingNotifications = await prepareGameCreationNotification(
          createdGame.id,
          "the_mole",
          {
            prize_amount: prizeAmount,
            staking_min_amount: (createdGame as { staking_min_amount?: number }).staking_min_amount ?? null,
          },
          new URL(`/the-mole?gameId=${createdGame.id}`, APP_URL).href
        );

        if (pendingNotifications) {
          safeLog("info", "[the-mole/games] Notification payload prepared", {
            gameId: createdGame.id,
            recipientCount: pendingNotifications.subscriberFids.length,
          });
        }
      } catch (notificationError: unknown) {
        const err = notificationError as { message?: string };
        safeLog("error", "[the-mole/games][notifications] Failed to prepare notifications", {
          gameId: createdGame.id,
          error: err?.message ?? String(notificationError),
        });
      }
    }

    const response = NextResponse.json<ApiResponse>({ ok: true, data: createdGame });

    if (pendingNotifications) {
      const payload = pendingNotifications;
      const { after } = await import("next/server");
      const { sendGameCreationNotificationAsync } = await import("~/lib/notifications");
      after(async () => {
        await sendGameCreationNotificationAsync(payload);
      });
    }

    return response;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[the-mole/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to create game" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const games = await pokerDb.fetch<unknown>("mole_games", {
      order: "created_at.desc",
      limit: 100,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: games ?? [] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[the-mole/games GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to fetch games" }, { status: 500 });
  }
}
