/**
 * Shared NL HOLDEM start logic: conditional transition open → in_progress.
 * Used by POST start (admin) and POST join (auto-start when full).
 * Phase 40.
 */

import { randomInt } from "node:crypto";
import { pokerDb } from "~/lib/pokerDb";
import { APP_URL } from "~/lib/constants";
import { sendNotificationToFid } from "~/lib/notifications";

/** Fisher-Yates shuffle using Node crypto (no Math.random). */
export function shuffleWithCrypto<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * If game is still open, set in_progress with shuffled seats and optionally send "game started" notifications.
 * Uses conditional update (WHERE id = gameId AND status = 'open') so only one concurrent caller wins.
 * Caller must ensure signupFids.length >= 2.
 * @returns seat order FIDs if we transitioned, null if another request won or already in progress
 */
export async function startGameWhenFull(
  gameId: string,
  signupFids: number[],
  isPreview: boolean
): Promise<number[] | null> {
  if (signupFids.length < 2) return null;

  const seatOrderFids = shuffleWithCrypto(signupFids);
  const now = new Date().toISOString();

  const updated = await pokerDb.update(
    "nl_holdem_games",
    { id: gameId, status: "open" },
    {
      status: "in_progress",
      updated_at: now,
      started_at: now,
      seat_order_fids: seatOrderFids,
    }
  );

  if (!updated || updated.length === 0) return null;

  if (!isPreview) {
    const targetUrl = `${APP_URL}/nl-holdem?gameId=${gameId}`;
    for (const f of seatOrderFids) {
      const notificationId = `nl_holdem_game_started:${gameId}:${f}`.slice(0, 128);
      sendNotificationToFid(
        f,
        {
          title: "NL HOLDEM",
          body: "The game has started. Open the app to play.",
          targetUrl,
        },
        notificationId
      ).catch((err) => console.error("[nl-holdem/startGameWhenFull] push failed:", err));
    }
  }
  return seatOrderFids;
}
