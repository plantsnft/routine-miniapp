/**
 * POST /api/jenga/games/[id]/start - Start game (admin only)
 * Shuffles turn order, fetches profiles from Neynar (one bulk call), stores in database,
 * initializes first turn, sends game started notification
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

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
    const games = await pokerDb.fetch<{ id: string; status: string; tower_state: any }>(
      "jenga_games",
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

    // Fetch all signups
    const signups = await pokerDb.fetch<{ id: string; fid: number }>("jenga_signups", {
      filters: { game_id: gameId },
      select: "id,fid",
      limit: 100,
    });

    if (!signups || signups.length < 2 || signups.length > 10) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game must have between 2 and 10 players to start." },
        { status: 400 }
      );
    }

    const fids = signups.map((s) => Number(s.fid));

    // ONE-TIME Neynar call to fetch all profiles (profile caching)
    const userMap: Record<number, { username?: string; display_name?: string; pfp_url?: string }> = {};
    try {
      const client = getNeynarClient();
      const { users } = await client.fetchBulkUsers({ fids });
      
      for (const u of users || []) {
        const userFid = (u as any).fid;
        if (userFid != null) {
          userMap[userFid] = {
            username: (u as any).username || null,
            display_name: (u as any).display_name || null,
            pfp_url: (u as any).pfp_url || (u as any).pfp?.url || null,
          };
        }
      }
    } catch (neynarError: any) {
      safeLog('error', '[jenga/games/[id]/start] Failed to fetch profiles from Neynar', {
        gameId,
        error: neynarError?.message || String(neynarError),
      });
      // Continue without profiles - they'll be null in database
    }

    // Store profiles in database (profile caching)
    for (const signup of signups) {
      const user = userMap[Number(signup.fid)] || {};
      await pokerDb.update(
        "jenga_signups",
        { id: signup.id },
        {
          username: user.username || null,
          display_name: user.display_name || null,
          pfp_url: user.pfp_url || null,
          updated_at: new Date().toISOString(),
        }
      );
    }

    // Shuffle turn order
    const turnOrder = shuffleArray(fids);

    // Initialize first turn
    const now = new Date().toISOString();
    const firstTurnFid = turnOrder[0];

    // Update game status
    await pokerDb.update(
      "jenga_games",
      { id: gameId },
      {
        status: "in_progress",
        turn_order: turnOrder,
        current_turn_fid: firstTurnFid,
        current_turn_started_at: now,
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
        
        // Fetch game to get prize_amount, turn_time_seconds, staking_min_amount
        const gameData = await pokerDb.fetch<{ prize_amount: number; turn_time_seconds: number; staking_min_amount?: number | null }>('jenga_games', {
          filters: { id: gameId },
          select: 'prize_amount,turn_time_seconds,staking_min_amount',
          limit: 1,
        });
        
        if (gameData && gameData.length > 0) {
          const stakingMinAmount = gameData[0].staking_min_amount != null ? Number(gameData[0].staking_min_amount) : null;
          pendingNotifications = await prepareGameCreationNotification(
            gameId,
            'jenga',
            {
              prize_amount: gameData[0].prize_amount,
              turn_time_seconds: gameData[0].turn_time_seconds,
              staking_min_amount: stakingMinAmount ?? null,
            },
            new URL(`/jenga?gameId=${gameId}`, APP_URL).href
          );
          
          // Override title and body for "game started" notification
          if (pendingNotifications) {
            pendingNotifications.title = 'JENGA game started';
            const turnTimeMinutes = Math.floor(gameData[0].turn_time_seconds / 60);
            const hasStakingRequirement = stakingMinAmount && stakingMinAmount > 0;
            const stakingText = hasStakingRequirement
              ? (await import('~/lib/format-prize')).formatPrizeAmount(stakingMinAmount)
              : '';
            pendingNotifications.body = `Prize: ${gameData[0].prize_amount} BETR. Turn time: ${turnTimeMinutes}m. Game is now in progress!${hasStakingRequirement ? ` Staking: ${stakingText} BETR required.` : ''}`;
            // Use 'jenga_game_started' event type
            pendingNotifications.notificationId = generateNotificationId('jenga_game_started', gameId);
            
            safeLog('info', '[jenga/games/[id]/start] Notification payload prepared', {
              gameId,
              recipientCount: pendingNotifications.subscriberFids.length,
              notificationId: pendingNotifications.notificationId,
              title: pendingNotifications.title,
            });
          } else {
            safeLog('warn', '[jenga/games/[id]/start] Notification payload is null (no eligible recipients or error)', {
              gameId,
            });
          }
        }
      } catch (notificationError: any) {
        safeLog('error', '[jenga/games/[id]/start][notifications] Failed to prepare notifications', {
          gameId,
          error: notificationError?.message || String(notificationError),
        });
      }
    } else {
      safeLog('info', '[jenga/games/[id]/start] Notifications disabled (ENABLE_PUSH_NOTIFICATIONS != true)', {
        gameId,
      });
    }

    // Return response immediately
    const response = NextResponse.json<ApiResponse>({
      ok: true,
      message: "Game started",
      data: { gameId, status: "in_progress", turnOrder },
    });

    // Send notifications asynchronously after response
    if (pendingNotifications) {
      const payload = pendingNotifications;
      const { after } = await import('next/server');
      const { sendGameCreationNotificationAsync } = await import('~/lib/notifications');
      
      safeLog('info', '[jenga/games/[id]/start] Scheduling async notification send', {
        gameId,
        recipientCount: payload.subscriberFids.length,
      });
      
      after(async () => {
        await sendGameCreationNotificationAsync(payload);
      });
    } else {
      safeLog('info', '[jenga/games/[id]/start] No notifications to send (pendingNotifications is null)', {
        gameId,
      });
    }

    return response;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to start game" }, { status: 500 });
  }
}
