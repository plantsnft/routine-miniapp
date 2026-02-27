/**
 * On-read timeout processing for JENGA: 10s handoff (V2) and turn_time_seconds timeout with replace (V2) or eliminate (V1).
 * Used by GET /api/jenga/games/[id] and GET /api/jenga/games/[id]/state.
 */

import { pokerDb } from "~/lib/pokerDb";
import { isTowerStateV2 } from "~/lib/jenga-tower-state-v2";
import { replaceBlock, wouldReplaceCauseFall } from "~/lib/jenga-official-rules";

export const HANDOFF_SECONDS = 10;

export async function processGameTimeout(gameId: string): Promise<boolean> {
  const now = new Date();
  const games = await pokerDb.fetch<{
    id: string;
    current_turn_fid: number | null;
    current_turn_started_at: string | null;
    turn_time_seconds: number;
    turn_order: number[];
    eliminated_fids: number[];
    move_lock_id: string | null;
    status: string;
    last_placement_at: string | null;
    tower_state: unknown;
  }>("jenga_games", {
    filters: { id: gameId },
    select: "id,current_turn_fid,current_turn_started_at,turn_time_seconds,turn_order,eliminated_fids,move_lock_id,status,last_placement_at,tower_state",
    limit: 1,
  });

  if (!games || games.length === 0) return false;
  const game = games[0];
  if (game.status !== "in_progress" || game.move_lock_id) return false;
  if (!game.current_turn_fid) return false;

  const isV2 = isTowerStateV2(game.tower_state);

  // V2: 10s handoff — if current_turn_started_at is null and now > last_placement_at + 10s, start the turn
  if (isV2 && game.last_placement_at && !game.current_turn_started_at) {
    const lastMs = new Date(game.last_placement_at).getTime();
    if (now.getTime() > lastMs + HANDOFF_SECONDS * 1000) {
      await pokerDb.update("jenga_games", { id: gameId }, { current_turn_started_at: now.toISOString(), updated_at: now.toISOString() });
      return true;
    }
    return false;
  }

  if (!game.current_turn_started_at) return false;

  const turnStart = new Date(game.current_turn_started_at);
  const turnEnd = new Date(turnStart.getTime() + game.turn_time_seconds * 1000);
  const warningTime = new Date(turnEnd.getTime() - 60000);

  if (now >= warningTime && now < turnEnd && process.env.ENABLE_PUSH_NOTIFICATIONS === "true") {
    try {
      const { notificationEventExists, sendJengaNotificationAsync } = await import("~/lib/notifications");
      const { APP_URL } = await import("~/lib/constants");
      const warningSent = await notificationEventExists("jenga_turn_warning", gameId, game.current_turn_fid);
      if (!warningSent) {
        await sendJengaNotificationAsync([game.current_turn_fid], "jenga_turn_warning", gameId, "JENGA: 1 minute left", "You have 1 minute left to make your move!", new URL(`/jenga?gameId=${gameId}`, APP_URL).href, game.current_turn_fid);
      }
    } catch (_) {}
  }

  if (now < turnEnd) return false;

  // Timeout: eliminate current, advance (V2: replace if blockInHand, or collapse if would fall)
  const currentFid = game.current_turn_fid;
  const turnOrder = (game.turn_order || []).filter((f: number) => f !== currentFid);
  const eliminatedFids = [...(game.eliminated_fids || []), currentFid];
  let newStatus: string = "in_progress";
  let gameEndedReason: string | null = null;
  if (turnOrder.length <= 1) {
    newStatus = "settled";
    gameEndedReason = turnOrder.length === 1 ? "last_player_standing" : "all_eliminated";
  }
  const nextTurnFid = turnOrder.length > 0 ? turnOrder[0] : null;
  const nextTurnStartedAt = turnOrder.length > 0 ? now.toISOString() : null;
  let notifyNextTurn = true;

  let patch: Record<string, unknown> = {
    turn_order: turnOrder,
    eliminated_fids: eliminatedFids,
    current_turn_fid: nextTurnFid,
    current_turn_started_at: nextTurnStartedAt,
    status: newStatus,
    game_ended_reason: gameEndedReason,
    updated_at: now.toISOString(),
  };

  if (isV2) {
    const ts = game.tower_state as { version: 2; tower: (number | null)[][][]; blockInHand: number | null; removedFrom: { level: number; row: number; block: number } | null };
    if (ts.blockInHand != null && ts.removedFrom != null) {
      if (wouldReplaceCauseFall(ts.tower, ts.blockInHand, ts.removedFrom)) {
        patch = { ...patch, status: "settled", game_ended_reason: "collapse", current_turn_fid: null, current_turn_started_at: null };
        notifyNextTurn = false;
      } else {
        const newTower = replaceBlock(ts.tower, ts.blockInHand, ts.removedFrom);
        if (newTower) {
          patch = { ...patch, tower_state: { version: 2, tower: newTower, blockInHand: null, removedFrom: null } };
        }
      }
    }
  }

  await pokerDb.update("jenga_games", { id: gameId }, patch);

  if (process.env.ENABLE_PUSH_NOTIFICATIONS === "true") {
    try {
      const { sendJengaNotificationAsync } = await import("~/lib/notifications");
      const { APP_URL } = await import("~/lib/constants");
      await sendJengaNotificationAsync([currentFid], "jenga_player_eliminated", gameId, "JENGA: Time's up", "You ran out of time and have been eliminated.", new URL(`/jenga?gameId=${gameId}`, APP_URL).href, currentFid);
    } catch (_) {}
  }
  if (nextTurnFid && notifyNextTurn && process.env.ENABLE_PUSH_NOTIFICATIONS === "true") {
    try {
      const { sendJengaNotificationAsync } = await import("~/lib/notifications");
      const { APP_URL } = await import("~/lib/constants");
      await sendJengaNotificationAsync([nextTurnFid], "jenga_turn_started", gameId, "JENGA: Your turn", "It's your turn to make a move!", new URL(`/jenga?gameId=${gameId}`, APP_URL).href, nextTurnFid);
    } catch (_) {}
  }
  return true;
}
