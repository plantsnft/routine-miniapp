/**
 * POST /api/buddy-up/games - Create new game (admin only)
 * GET /api/buddy-up/games - List all games
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

    const signup_closes_at: string | null = signupClosesAtRaw;
    const min_players_to_start: number | null = minPlayersToStart != null && !isNaN(minPlayersToStart) ? minPlayersToStart : null;
    const start_condition: string | null = startCondition;

    if (start_condition === "at_time" || start_condition === "whichever_first") {
      if (!signup_closes_at) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "signupClosesAt is required when startCondition is at_time or whichever_first" }, { status: 400 });
      }
      const t = new Date(signup_closes_at).getTime();
      if (isNaN(t) || t <= Date.now()) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "signupClosesAt must be a future date/time" }, { status: 400 });
      }
    }
    if (start_condition === "min_players" || start_condition === "whichever_first") {
      if (min_players_to_start == null || min_players_to_start < 1) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "minPlayersToStart is required when startCondition is min_players or whichever_first" }, { status: 400 });
      }
    }

    const resolvedStaking = (stakingMinAmount != null && !isNaN(stakingMinAmount) && stakingMinAmount > 0) ? stakingMinAmount : null;
    const now = new Date().toISOString();
    const game = await pokerDb.insert("buddy_up_games", [
      {
        title: "BUDDY UP",
        prize_amount: prizeAmount,
        staking_min_amount: resolvedStaking,
        status: "signup",
        current_round: 1,
        created_by_fid: fid,
        created_at: now,
        updated_at: now,
        min_players_to_start: min_players_to_start ?? null,
        signup_closes_at: signup_closes_at ?? null,
        start_condition: start_condition ?? null,
        community,
      },
    ]);

    if (!game || game.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create game" }, { status: 500 });
    }

    const createdGame = game[0] as unknown as { id: string; [key: string]: any };

    // Prepare notification payload
    let pendingNotifications: Awaited<ReturnType<typeof import('~/lib/notifications').prepareGameCreationNotification>> = null;

    if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
      try {
        const { prepareGameCreationNotification } = await import('~/lib/notifications');
        const { APP_URL } = await import('~/lib/constants');
        
        safeLog('info', '[buddy-up/games] Preparing game creation notification', {
          gameId: createdGame.id,
          prizeAmount,
        });
        
        // Audience: betr_games_registrations ∩ enabled; targetUrl includes ?gameId= for deep link; idempotency in sendGameCreationNotificationAsync
        pendingNotifications = await prepareGameCreationNotification(
          createdGame.id,
          'buddy_up',
          {
            prize_amount: prizeAmount,
            staking_min_amount: resolvedStaking ?? (createdGame as any).staking_min_amount ?? null,
          },
          new URL(`/buddy-up?gameId=${createdGame.id}`, APP_URL).href
        );
        
        if (pendingNotifications) {
          safeLog('info', '[buddy-up/games] Notification payload prepared', {
            gameId: createdGame.id,
            recipientCount: pendingNotifications.subscriberFids.length,
            notificationId: pendingNotifications.notificationId,
            hasGameIdInTargetUrl: pendingNotifications.targetUrl.includes('gameId='),
          });
        } else {
          safeLog('warn', '[buddy-up/games] Notification payload is null (no eligible recipients or error)', {
            gameId: createdGame.id,
            audience: 'betr_games_registrations ∩ enabled_subscriptions',
          });
        }
      } catch (notificationError: any) {
        safeLog('error', '[buddy-up/games][notifications] Failed to prepare notifications', {
          gameId: createdGame.id,
          error: notificationError?.message || String(notificationError),
        });
      }
    } else {
      safeLog('info', '[buddy-up/games] Notifications disabled (ENABLE_PUSH_NOTIFICATIONS != true)', {
        gameId: createdGame.id,
      });
    }

    // Return response immediately
    const response = NextResponse.json<ApiResponse>({ ok: true, data: createdGame });

    // Send notifications asynchronously after response
    if (pendingNotifications) {
      const payload = pendingNotifications;
      const { after } = await import('next/server');
      const { sendGameCreationNotificationAsync } = await import('~/lib/notifications');
      
      safeLog('info', '[buddy-up/games] Scheduling async notification send', {
        gameId: createdGame.id,
        recipientCount: payload.subscriberFids.length,
      });
      
      after(async () => {
        await sendGameCreationNotificationAsync(payload);
      });
    } else {
      safeLog('info', '[buddy-up/games] No notifications to send (pendingNotifications is null)', {
        gameId: createdGame.id,
      });
    }

    return response;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const games = await pokerDb.fetch<any>("buddy_up_games", {
      order: "created_at.desc",
      limit: 100,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: games || [] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[buddy-up/games GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch games" }, { status: 500 });
  }
}
