/**
 * POST /api/buddy-up/games/[id]/start - Start game (admin only)
 * Stops signups, sets status to 'in_progress'. Admin must then create round 1 manually.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    // Check game exists and is in signup phase
    const games = await pokerDb.fetch<{ id: string; status: string }>(
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

    if (game.status !== "signup") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in signup phase" }, { status: 400 });
    }

    // Update game status
    const now = new Date().toISOString();
    await pokerDb.update(
      "buddy_up_games",
      { id: gameId },
      {
        status: "in_progress",
        started_at: now,
        updated_at: now,
      }
    );

    // Prepare notification payload
    let pendingNotifications: Awaited<ReturnType<typeof import('~/lib/notifications').prepareGameCreationNotification>> = null;

    if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
      try {
        const { prepareGameCreationNotification, generateNotificationId } = await import('~/lib/notifications');
        const { APP_URL } = await import('~/lib/constants');
        
        safeLog('info', '[buddy-up/games/[id]/start] Preparing game start notification', {
          gameId,
        });
        
        // Fetch game to get prize_amount and staking_min_amount
        const gameData = await pokerDb.fetch<{ prize_amount: number; staking_min_amount?: number | null }>('buddy_up_games', {
          filters: { id: gameId },
          select: 'prize_amount,staking_min_amount',
          limit: 1,
        });
        
        if (gameData && gameData.length > 0) {
          const stakingMinAmount = gameData[0].staking_min_amount != null ? Number(gameData[0].staking_min_amount) : null;
          // Audience: betr_games_registrations ∩ enabled; targetUrl includes ?gameId=; idempotency in sendGameCreationNotificationAsync
          pendingNotifications = await prepareGameCreationNotification(
            gameId,
            'buddy_up',
            {
              prize_amount: gameData[0].prize_amount,
              staking_min_amount: stakingMinAmount ?? null,
            },
            new URL(`/buddy-up?gameId=${gameId}`, APP_URL).href
          );
          
          // Override title and body for "game started" notification
          if (pendingNotifications) {
            const hasStakingRequirement = stakingMinAmount && stakingMinAmount > 0;
            let stakingText = '';
            if (hasStakingRequirement) {
              const { formatPrizeAmount } = await import('~/lib/format-prize');
              stakingText = ` Staking: ${formatPrizeAmount(stakingMinAmount)} BETR required.`;
            }
            
            pendingNotifications.title = 'BUDDY UP game started';
            pendingNotifications.body = `Prize: ${gameData[0].prize_amount} BETR. Game is now in progress!${stakingText}`;
            // Use 'game_started' event type instead of 'game_created:started' to avoid invalid notification ID format
            pendingNotifications.notificationId = generateNotificationId('game_started', gameId);
            
            safeLog('info', '[buddy-up/games/[id]/start] Notification payload prepared', {
              gameId,
              recipientCount: pendingNotifications.subscriberFids.length,
              notificationId: pendingNotifications.notificationId,
              title: pendingNotifications.title,
              hasGameIdInTargetUrl: pendingNotifications.targetUrl.includes('gameId='),
            });
          } else {
            safeLog('warn', '[buddy-up/games/[id]/start] Notification payload is null (no eligible recipients or error)', {
              gameId,
              audience: 'betr_games_registrations ∩ enabled_subscriptions',
            });
          }
        }
      } catch (notificationError: any) {
        safeLog('error', '[buddy-up/games/[id]/start][notifications] Failed to prepare notifications', {
          gameId,
          error: notificationError?.message || String(notificationError),
        });
      }
    } else {
      safeLog('info', '[buddy-up/games/[id]/start] Notifications disabled (ENABLE_PUSH_NOTIFICATIONS != true)', {
        gameId,
      });
    }

    // Return response immediately
    const response = NextResponse.json<ApiResponse>({
      ok: true,
      message: "Game started",
      data: { gameId, status: "in_progress" },
    });

    // Send notifications asynchronously after response
    if (pendingNotifications) {
      const payload = pendingNotifications;
      const { after } = await import('next/server');
      const { sendGameCreationNotificationAsync } = await import('~/lib/notifications');
      
      safeLog('info', '[buddy-up/games/[id]/start] Scheduling async notification send', {
        gameId,
        recipientCount: payload.subscriberFids.length,
      });
      
      after(async () => {
        await sendGameCreationNotificationAsync(payload);
      });
    } else {
      safeLog('info', '[buddy-up/games/[id]/start] No notifications to send (pendingNotifications is null)', {
        gameId,
      });
    }

    return response;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
