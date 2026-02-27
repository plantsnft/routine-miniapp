/**
 * POST /api/the-mole/games/[id]/start - Start game (admin only)
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

    const games = await pokerDb.fetch<{ id: string; status: string }>("mole_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "signup") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in signup phase" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await pokerDb.update("mole_games", { id: gameId }, {
      status: "in_progress",
      started_at: now,
      updated_at: now,
    });

    let pendingNotifications: Awaited<ReturnType<typeof import("~/lib/notifications").prepareGameCreationNotification>> = null;

    if (process.env.ENABLE_PUSH_NOTIFICATIONS === "true") {
      try {
        const { prepareGameCreationNotification, generateNotificationId } = await import("~/lib/notifications");
        const { APP_URL } = await import("~/lib/constants");

        safeLog("info", "[the-mole/games/[id]/start] Preparing game start notification", { gameId });

        const gameData = await pokerDb.fetch<{ prize_amount: number; staking_min_amount?: number }>("mole_games", {
          filters: { id: gameId },
          select: "prize_amount,staking_min_amount",
          limit: 1,
        });

        if (gameData && gameData.length > 0) {
          pendingNotifications = await prepareGameCreationNotification(
            gameId,
            "the_mole",
            {
              prize_amount: gameData[0].prize_amount,
              staking_min_amount: gameData[0].staking_min_amount ?? null,
            },
            new URL(`/the-mole?gameId=${gameId}`, APP_URL).href
          );

          if (pendingNotifications) {
            const stakingMinAmount = gameData[0].staking_min_amount ?? null;
            const hasStaking = stakingMinAmount != null && stakingMinAmount > 0;
            let stakingText = "";
            if (hasStaking) {
              const { formatPrizeAmount } = await import("~/lib/format-prize");
              stakingText = ` Staking: ${formatPrizeAmount(stakingMinAmount)} BETR required.`;
            }
            pendingNotifications.title = "THE MOLE game started";
            pendingNotifications.body = `Prize: ${gameData[0].prize_amount} BETR. Game is now in progress!${stakingText}`;
            pendingNotifications.notificationId = generateNotificationId("game_started", gameId);
          }
        }
      } catch (notificationError: unknown) {
        const err = notificationError as { message?: string };
        safeLog("error", "[the-mole/games/[id]/start][notifications] Failed", { gameId, error: err?.message ?? String(notificationError) });
      }
    }

    const response = NextResponse.json<ApiResponse>({ ok: true, message: "Game started", data: { gameId, status: "in_progress" } });

    if (pendingNotifications) {
      const { after } = await import("next/server");
      const { sendGameCreationNotificationAsync } = await import("~/lib/notifications");
      after(async () => { await sendGameCreationNotificationAsync(pendingNotifications!); });
    }

    return response;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[the-mole/games/[id]/start POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to start game" }, { status: 500 });
  }
}
