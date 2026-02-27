import { NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { APP_URL } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import {
  sendBulkNotifications,
  logNotificationEvent,
  notificationEventExists,
  generateNotificationId,
} from "~/lib/notifications";
import { buildGameStartedPayload } from "~/lib/game-started-notification";

/**
 * Cron endpoint: send "game started" to poker participants when scheduled start time has passed.
 * GET /api/cron/poker-game-start-notifications
 *
 * Finds open, non-preview burrfriends_games where game_date <= now, sends to participants only,
 * then sets status to in_progress. Secured by x-vercel-cron or CRON_SECRET.
 */
export async function GET(req: Request) {
  const cronHeader = req.headers.get("x-vercel-cron");
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!cronHeader && (!cronSecret || providedSecret !== cronSecret)) {
    safeLog("warn", "[cron/poker-game-start-notifications] Unauthorized cron request");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const enableNotifications = process.env.ENABLE_PUSH_NOTIFICATIONS === "true";

  try {
    const gamesRaw = await pokerDb.fetch<
      {
        id: string;
        game_date: string | null;
        name: string | null;
        prize_amounts?: number[] | null;
        prize_currency?: string | null;
        max_participants?: number | null;
        staking_min_amount?: number | null;
        buy_in_amount?: number | null;
        buy_in_currency?: string | null;
      }
    >("burrfriends_games", {
      filters: { status: "open", is_preview: false },
      select: "id,game_date,name,prize_amounts,prize_currency,max_participants,staking_min_amount,buy_in_amount,buy_in_currency",
      limit: 100,
    });

    const now = new Date();
    const gamesToProcess = (gamesRaw || []).filter(
      (g) => g.game_date != null && new Date(g.game_date) <= now
    );

    if (gamesToProcess.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let totalSent = 0;
    for (const game of gamesToProcess) {
      const participants = await pokerDb.fetch<{ fid: number }>("burrfriends_participants", {
        filters: { game_id: game.id, status: "joined" },
        select: "fid",
      });
      const participantFids = Array.from(new Set((participants || []).map((p) => p.fid)));

      const toNotify: number[] = [];
      for (const fid of participantFids) {
        const alreadySent = await notificationEventExists("game_started", game.id, fid);
        if (!alreadySent) toNotify.push(fid);
      }

      if (enableNotifications && toNotify.length > 0) {
        const { title, body } = buildGameStartedPayload(game, participantFids.length);
        const notificationId = generateNotificationId("game_started", game.id);
        const results = await sendBulkNotifications(
          toNotify,
          {
            title,
            body,
            targetUrl: new URL(`/games/${game.id}?fromNotif=game_started`, APP_URL).href,
          },
          notificationId
        );
        for (const result of results) {
          if (result.fid !== undefined) {
            const alreadySent = await notificationEventExists("game_started", game.id, result.fid);
            if (!alreadySent) {
              await logNotificationEvent(
                "game_started",
                game.id,
                result.fid,
                result.success ? "sent" : "failed",
                result.error
              );
            }
          }
        }
        totalSent += results.filter((r) => r.success).length;
        safeLog("info", "[cron/poker-game-start-notifications] Sent game started notifications", {
          gameId: game.id,
          requested: toNotify.length,
          success: results.filter((r) => r.success).length,
        });
      }

      await pokerDb.update("burrfriends_games", { id: game.id }, { status: "in_progress" });
    }

    return NextResponse.json({ ok: true, processed: gamesToProcess.length, notificationsSent: totalSent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    safeLog("error", "[cron/poker-game-start-notifications] Failed", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
