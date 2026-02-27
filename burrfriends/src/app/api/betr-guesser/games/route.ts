/**
 * POST /api/betr-guesser/games - Create new game (admin only)
 * GET /api/betr-guesser/games - List all games (with auto-close logic)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

// Auto-close games where guesses_close_at passed or min_players reached (per start_condition)
async function autoCloseGames() {
  const openGames = await pokerDb.fetch<{ id: string }>(
    "betr_guesser_games",
    { filters: { status: "open" }, select: "id", limit: 1000 }
  );
  if (!openGames || openGames.length === 0) return 0;
  const { maybeCloseBetrGuesserGame } = await import("~/lib/betr-guesser-auto-close");
  let closed = 0;
  for (const g of openGames) {
    if (await maybeCloseBetrGuesserGame(g.id)) closed++;
  }
  return closed;
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const community: 'betr' | 'minted_merch' = body.community === 'minted_merch' ? 'minted_merch' : 'betr';
    const prizeAmount = typeof body.prizeAmount === "number" ? body.prizeAmount : parseFloat(String(body.prizeAmount || ""));
    const guessesCloseAt = typeof body.guessesCloseAt === "string" ? body.guessesCloseAt.trim() : null;
    const stakingMinAmount = typeof body.stakingMinAmount === "number" ? body.stakingMinAmount : (body.stakingMinAmount != null ? parseFloat(String(body.stakingMinAmount)) : null);
    const minPlayersToStart = body.minPlayersToStart != null ? Number(body.minPlayersToStart) : null;
    const startCondition = typeof body.startCondition === "string" && ["at_time", "min_players", "whichever_first"].includes(body.startCondition) ? body.startCondition : null;
    // Optional invite-only: exactly 5 FIDs
    let whitelist_fids: number[] | null = null;
    if (Array.isArray(body.whitelistFids) && body.whitelistFids.length === 5) {
      const parsed = body.whitelistFids.map((x: unknown) => (typeof x === "number" && Number.isInteger(x) ? x : parseInt(String(x), 10))).filter((n: number) => !isNaN(n) && n > 0);
      if (parsed.length === 5) {
        whitelist_fids = parsed;
      }
    }
    if (body.whitelistFids != null && !Array.isArray(body.whitelistFids)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "whitelistFids must be an array of exactly 5 FIDs" }, { status: 400 });
    }
    if (Array.isArray(body.whitelistFids) && body.whitelistFids.length !== 5) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "whitelistFids must contain exactly 5 FIDs" }, { status: 400 });
    }

    if (isNaN(prizeAmount) || prizeAmount <= 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid prize amount" }, { status: 400 });
    }

    if (!guessesCloseAt) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "guessesCloseAt is required" }, { status: 400 });
    }

    const closeTime = new Date(guessesCloseAt);
    if (isNaN(closeTime.getTime()) || closeTime.getTime() <= Date.now()) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "guessesCloseAt must be a future timestamp" }, { status: 400 });
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
    const min_players_to_start = minPlayersToStart != null && !isNaN(minPlayersToStart) ? minPlayersToStart : null;
    const start_condition = startCondition ?? (min_players_to_start != null ? "whichever_first" : "at_time");
    const game = await pokerDb.insert("betr_guesser_games", [
      {
        title: "BETR GUESSER",
        prize_amount: prizeAmount,
        guesses_close_at: guessesCloseAt,
        staking_min_amount: resolvedStaking,
        status: "open",
        created_by_fid: fid,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        min_players_to_start: min_players_to_start ?? null,
        start_condition: start_condition ?? null,
        community,
        ...(whitelist_fids != null && { whitelist_fids }),
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
        
        safeLog('info', '[betr-guesser/games] Preparing game creation notification', {
          gameId: createdGame.id,
          prizeAmount,
          guessesCloseAt,
        });
        
        pendingNotifications = await prepareGameCreationNotification(
          createdGame.id,
          'betr_guesser',
          {
            prize_amount: prizeAmount,
            guesses_close_at: guessesCloseAt,
            staking_min_amount: resolvedStaking ?? (createdGame as any).staking_min_amount ?? null,
          },
          new URL(`/betr-guesser?gameId=${createdGame.id}`, APP_URL).href
        );
        
        if (pendingNotifications) {
          safeLog('info', '[betr-guesser/games] Notification payload prepared', {
            gameId: createdGame.id,
            recipientCount: pendingNotifications.subscriberFids.length,
            notificationId: pendingNotifications.notificationId,
          });
        } else {
          safeLog('warn', '[betr-guesser/games] Notification payload is null (no eligible recipients or error)', {
            gameId: createdGame.id,
          });
        }
      } catch (notificationError: any) {
        safeLog('error', '[betr-guesser/games][notifications] Failed to prepare notifications', {
          gameId: createdGame.id,
          error: notificationError?.message || String(notificationError),
        });
      }
    } else {
      safeLog('info', '[betr-guesser/games] Notifications disabled (ENABLE_PUSH_NOTIFICATIONS != true)', {
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
      
      safeLog('info', '[betr-guesser/games] Scheduling async notification send', {
        gameId: createdGame.id,
        recipientCount: payload.subscriberFids.length,
      });
      
      after(async () => {
        await sendGameCreationNotificationAsync(payload);
      });
    } else {
      safeLog('info', '[betr-guesser/games] No notifications to send (pendingNotifications is null)', {
        gameId: createdGame.id,
      });
    }

    return response;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    // Auto-close expired games
    await autoCloseGames();

    const games = await pokerDb.fetch<any>("betr_guesser_games", {
      order: "created_at.desc",
      limit: 100,
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: games || [] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[betr-guesser/games GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch games" }, { status: 500 });
  }
}
