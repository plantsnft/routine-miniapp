/**
 * POST /api/jenga/games - Create new game (admin only)
 * Note: Active games are fetched via /api/jenga/games/active (public endpoint)
 *
 * Phase 6: Create is ALWAYS the new (official) JENGA with v2 tower_state.
 * No v2 opt-in; no new v1 games. Legacy v1 remains read-only for in-progress games.
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
    const turnTimeSeconds = typeof body.turnTimeSeconds === "number" ? body.turnTimeSeconds : parseInt(String(body.turnTimeSeconds || ""), 10);
    const stakingMinAmount = typeof body.stakingMinAmount === "number" ? body.stakingMinAmount : (body.stakingMinAmount != null ? parseFloat(String(body.stakingMinAmount)) : null);

    if (isNaN(prizeAmount) || prizeAmount <= 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid prize amount" }, { status: 400 });
    }

    if (isNaN(turnTimeSeconds) || turnTimeSeconds < 60 || turnTimeSeconds > 3600) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Turn time must be between 60 and 3600 seconds (1 minute to 1 hour)" },
        { status: 400 }
      );
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

    const resolvedStaking = (stakingMinAmount != null && !isNaN(stakingMinAmount) && stakingMinAmount > 0) ? stakingMinAmount : null;
    const now = new Date().toISOString();
    const { initializeTowerV2 } = await import("~/lib/jenga-tower-state-v2");
    const towerState = initializeTowerV2();

    const game = await pokerDb.insert("jenga_games", [
      {
        title: "JENGA",
        prize_amount: prizeAmount,
        turn_time_seconds: turnTimeSeconds,
        staking_min_amount: resolvedStaking,
        status: "signup",
        turn_order: [],
        eliminated_fids: [],
        tower_state: towerState,
        move_count: 0,
        created_by_fid: fid,
        created_at: now,
        updated_at: now,
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
        
        safeLog('info', '[jenga/games] Preparing game creation notification', {
          gameId: createdGame.id,
          prizeAmount,
          turnTimeSeconds,
        });
        
        pendingNotifications = await prepareGameCreationNotification(
          createdGame.id,
          'jenga',
          {
            prize_amount: prizeAmount,
            turn_time_seconds: turnTimeSeconds,
            staking_min_amount: resolvedStaking ?? (createdGame as any).staking_min_amount ?? null,
          },
          new URL(`/jenga?gameId=${createdGame.id}`, APP_URL).href
        );
        
        if (pendingNotifications) {
          // Override title for JENGA
          pendingNotifications.title = 'New JENGA game';
          const stakingText = resolvedStaking != null && resolvedStaking > 0
            ? ` Staking: ${resolvedStaking >= 1_000_000 ? `${resolvedStaking / 1_000_000}M` : resolvedStaking} BETR required.`
            : '';
          pendingNotifications.body = `Prize: ${prizeAmount} BETR. Turn time: ${Math.floor(turnTimeSeconds / 60)}m. Sign up now!${stakingText}`;
          
          safeLog('info', '[jenga/games] Notification payload prepared', {
            gameId: createdGame.id,
            recipientCount: pendingNotifications.subscriberFids.length,
            notificationId: pendingNotifications.notificationId,
          });
        } else {
          safeLog('warn', '[jenga/games] Notification payload is null (no eligible recipients or error)', {
            gameId: createdGame.id,
          });
        }
      } catch (notificationError: any) {
        safeLog('error', '[jenga/games][notifications] Failed to prepare notifications', {
          gameId: createdGame.id,
          error: notificationError?.message || String(notificationError),
        });
      }
    } else {
      safeLog('info', '[jenga/games] Notifications disabled (ENABLE_PUSH_NOTIFICATIONS != true)', {
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
      
      safeLog('info', '[jenga/games] Scheduling async notification send', {
        gameId: createdGame.id,
        recipientCount: payload.subscriberFids.length,
      });
      
      after(async () => {
        await sendGameCreationNotificationAsync(payload);
      });
    } else {
      safeLog('info', '[jenga/games] No notifications to send (pendingNotifications is null)', {
        gameId: createdGame.id,
      });
    }

    return response;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}
