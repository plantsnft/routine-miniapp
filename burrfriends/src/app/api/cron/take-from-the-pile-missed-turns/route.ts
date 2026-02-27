/**
 * Cron: advance TAKE FROM THE PILE games when current turn timer has expired (missed turn → move to back).
 * GET /api/cron/take-from-the-pile-missed-turns
 * Secured by x-vercel-cron or CRON_SECRET. Phase 37.
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
    safeLog("warn", "[cron/take-from-the-pile-missed-turns] Unauthorized cron request");
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
      current_turn_ends_at: string | null;
      timer_paused_at: string | null;
      pick_deadline_minutes: number;
      current_pot_amount: number;
    }>("take_from_the_pile_games", {
      filters: { status: "in_progress" },
      select: "id,is_preview,turn_order_fids,current_turn_ends_at,timer_paused_at,pick_deadline_minutes,current_pot_amount",
      limit: 50,
    });

    const toProcess = (gamesRaw || []).filter(
      (g) =>
        !g.timer_paused_at &&
        (g.turn_order_fids || []).length > 0 &&
        g.current_turn_ends_at != null &&
        new Date(g.current_turn_ends_at) < now
    );

    let processed = 0;
    for (const game of toProcess) {
      const gameId = game.id;
      const turnOrderFids = (game.turn_order_fids || []) as number[];
      const currentFid = turnOrderFids[0];
      const currentPot = Number(game.current_pot_amount ?? 0);
      const deadlineMinutes = game.pick_deadline_minutes ?? 60;

      const preloadRows = await pokerDb.fetch<{ preload_amount: number }>("take_from_the_pile_preloads", {
        filters: { game_id: gameId, fid: currentFid },
        limit: 1,
      });
      const hasPreload = preloadRows && preloadRows.length > 0;
      const preloadAmount = hasPreload ? Number(preloadRows![0].preload_amount) : 0;
      const usePreload = hasPreload && preloadAmount <= currentPot;

      if (usePreload) {
        let newPot = currentPot - preloadAmount;
        let newQueue = turnOrderFids.slice(1);
        const toInsert: Array<{ fid: number; amount: number }> = [{ fid: currentFid, amount: preloadAmount }];

        while (newQueue.length > 0) {
          const headFid = Number(newQueue[0]);
          const drainPreload = await pokerDb.fetch<{ preload_amount: number }>("take_from_the_pile_preloads", {
            filters: { game_id: gameId, fid: headFid },
            limit: 1,
          });
          if (!drainPreload?.length || Number(drainPreload[0].preload_amount) > newPot) break;
          const amt = Number(drainPreload[0].preload_amount);
          toInsert.push({ fid: headFid, amount: amt });
          newPot -= amt;
          newQueue = newQueue.slice(1);
        }

        const newEndsAt =
          newQueue.length > 0 ? new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString() : null;

        const updated = await pokerDb.updateWhere(
          "take_from_the_pile_games",
          [
            { key: "id", op: "eq", value: gameId },
            { key: "current_turn_ends_at", op: "lt", value: nowIso },
          ],
          {
            current_pot_amount: newPot,
            turn_order_fids: newQueue,
            current_turn_ends_at: newEndsAt,
            updated_at: nowIso,
          }
        );

        if (updated && updated.length > 0) {
          const existingEvents = await pokerDb.fetch<{ sequence: number }>("take_from_the_pile_events", {
            filters: { game_id: gameId },
            select: "sequence",
            limit: 10000,
          });
          const maxSeq =
            (existingEvents || []).length > 0 ? Math.max(...(existingEvents || []).map((e) => Number(e.sequence))) : 0;
          let seq = maxSeq + 1;
          for (const { fid: f, amount: a } of toInsert) {
            await pokerDb.insert("take_from_the_pile_picks", [
              { game_id: gameId, fid: f, amount_taken: a, taken_at: nowIso },
            ]);
            await pokerDb.insert("take_from_the_pile_events", [
              { game_id: gameId, sequence: seq, fid: f, event_type: "pick", amount_taken: a },
            ]);
            await pokerDb.delete("take_from_the_pile_preloads", { game_id: gameId, fid: f });
            seq += 1;
          }
          if (newQueue.length > 0 && game.is_preview !== true) {
            const targetUrl = `${APP_URL}/take-from-the-pile?gameId=${gameId}`;
            const notificationId = `take_from_the_pile_turn:${gameId}:${newQueue[0]}`.slice(0, 128);
            sendNotificationToFid(
              newQueue[0],
              { title: "TAKE FROM THE PILE", body: "It's your turn to take from the pile.", targetUrl },
              notificationId
            ).catch((err) => safeLog("error", "[cron/take-from-the-pile-missed-turns] push failed", { gameId, err }));
          }
        }
      } else {
        const newQueue = [...turnOrderFids.slice(1), currentFid];
        const newEndsAt = new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString();

        const updated = await pokerDb.updateWhere(
          "take_from_the_pile_games",
          [
            { key: "id", op: "eq", value: gameId },
            { key: "current_turn_ends_at", op: "lt", value: nowIso },
          ],
          {
            turn_order_fids: newQueue,
            current_turn_ends_at: newEndsAt,
            updated_at: nowIso,
          }
        );

        if (!updated || updated.length === 0) {
          continue;
        }

        const existingEvents = await pokerDb.fetch<{ sequence: number }>("take_from_the_pile_events", {
          filters: { game_id: gameId },
          select: "sequence",
          limit: 10000,
        });
        const maxSeq =
          (existingEvents || []).length > 0 ? Math.max(...(existingEvents || []).map((e) => Number(e.sequence))) : 0;
        const nextSeq = maxSeq + 1;

        await pokerDb.insert("take_from_the_pile_events", [
          { game_id: gameId, sequence: nextSeq, fid: currentFid, event_type: "skip", amount_taken: null },
        ]);

        const newCurrentFid = newQueue[0];
        if (game.is_preview !== true) {
          const targetUrl = `${APP_URL}/take-from-the-pile?gameId=${gameId}`;
          const notificationId = `take_from_the_pile_turn:${gameId}:${newCurrentFid}`.slice(0, 128);
          sendNotificationToFid(
            newCurrentFid,
            { title: "TAKE FROM THE PILE", body: "It's your turn to take from the pile.", targetUrl },
            notificationId
          ).catch((err) => safeLog("error", "[cron/take-from-the-pile-missed-turns] push failed", { gameId, err }));
        }
      }

      processed++;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    safeLog("error", "[cron/take-from-the-pile-missed-turns] Failed", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
