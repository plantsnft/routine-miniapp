/**
 * Cron: advance KILL OR KEEP games when current turn timer has expired (missed turn → skip, no reorder).
 * GET /api/cron/kill-or-keep-missed-turns
 * Secured by x-vercel-cron or CRON_SECRET. Phase 38.
 * Concurrency: optimistic update (filter by id + current_turn_ends_at) so only one process advances a given turn.
 */

import { NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { APP_URL } from "~/lib/constants";
import { sendNotificationToFid } from "~/lib/notifications";
import { safeLog } from "~/lib/redaction";

export async function GET(req: Request) {
  const cronHeader = req.headers.get("x-vercel-cron");
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!cronHeader && (!cronSecret || providedSecret !== cronSecret)) {
    safeLog("warn", "[cron/kill-or-keep-missed-turns] Unauthorized cron request");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const gamesRaw = await pokerDb.fetch<{
      id: string;
      status: string;
      is_preview?: boolean;
      turn_order_fids: number[];
      remaining_fids: number[];
      eliminated_fids: number[];
      current_turn_fid: number | null;
      current_turn_ends_at: string | null;
    }>("kill_or_keep_games", {
      filters: { status: "in_progress" },
      select: "id,is_preview,turn_order_fids,remaining_fids,eliminated_fids,current_turn_fid,current_turn_ends_at",
      limit: 50,
    });

    const toProcess = (gamesRaw || []).filter(
      (g) =>
        g.current_turn_ends_at != null &&
        new Date(g.current_turn_ends_at) < now &&
        (g.turn_order_fids || []).length > 0
    );

    let processed = 0;
    for (const game of toProcess) {
      const gameId = game.id;
      const currentTurnFid = game.current_turn_fid != null ? Number(game.current_turn_fid) : null;
      if (currentTurnFid == null) continue;

      const turnOrderFids = (game.turn_order_fids || []).map((f: unknown) => Number(f)) as number[];
      const remainingFids = (game.remaining_fids || []).map((f: unknown) => Number(f)) as number[];

      // Remaining players in current turn order; next = person after current, wrap
      const orderInRemaining = turnOrderFids.filter((f) => remainingFids.includes(f));
      if (orderInRemaining.length === 0) continue;
      const currentIdx = orderInRemaining.indexOf(currentTurnFid);
      const nextIdx = (currentIdx + 1) % orderInRemaining.length;
      const nextFid = orderInRemaining[nextIdx];
      const roundComplete = nextIdx === 0;

      const newEndsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Optimistic lock: only update if current_turn_ends_at is still the expired value (do not change turn_order_fids)
      const updated = await pokerDb.updateWhere(
        "kill_or_keep_games",
        [
          { key: "id", op: "eq", value: gameId },
          { key: "current_turn_ends_at", op: "lt", value: nowIso },
        ],
        {
          current_turn_fid: nextFid,
          current_turn_ends_at: newEndsAt,
          updated_at: nowIso,
        }
      );

      if (!updated || updated.length === 0) {
        // Another process already advanced this turn
        continue;
      }

      // Insert skip action for the activity log
      const existingActions = await pokerDb.fetch<{ sequence: number }>("kill_or_keep_actions", {
        filters: { game_id: gameId },
        select: "sequence",
        limit: 10000,
      });
      const maxSeq = (existingActions || []).length > 0 ? Math.max(...(existingActions || []).map((e) => Number(e.sequence))) : 0;
      const nextSeq = maxSeq + 1;

      await pokerDb.insert("kill_or_keep_actions", [
        { game_id: gameId, sequence: nextSeq, actor_fid: 0, action: "skip", target_fid: currentTurnFid, created_at: nowIso },
      ]);

      // Check if this advance completes a round and settles the game
      const shouldSettle = roundComplete && remainingFids.length <= 10;

      if (shouldSettle) {
        await pokerDb.update("kill_or_keep_games", { id: gameId }, {
          status: "settled",
          current_turn_fid: null,
          current_turn_ends_at: null,
          updated_at: nowIso,
        });
      } else if (game.is_preview !== true) {
        const targetUrl = `${APP_URL}/kill-or-keep?gameId=${gameId}`;
        const notificationId = `kill_or_keep_turn:${gameId}:${nextFid}`.slice(0, 128);
        sendNotificationToFid(
          nextFid,
          { title: "KILL OR KEEP", body: "It's your turn — Keep or Kill one player.", targetUrl },
          notificationId
        ).catch((err) => safeLog("error", "[cron/kill-or-keep-missed-turns] push failed", { gameId, err }));
      }

      processed++;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    safeLog("error", "[cron/kill-or-keep-missed-turns] Failed", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
