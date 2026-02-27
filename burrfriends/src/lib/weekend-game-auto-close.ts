/**
 * Auto-close logic for WEEKEND GAME rounds (Phase 30).
 * When status is 'open' and submissions_close_at has passed, set status to 'closed'.
 * Same pattern as remix-betr-auto-close.ts.
 */

import { pokerDb } from "~/lib/pokerDb";

export async function maybeCloseWeekendGameRound(roundId: string): Promise<boolean> {
  const rounds = await pokerDb.fetch<{
    id: string;
    status: string;
    submissions_close_at: string;
  }>("weekend_game_rounds", {
    filters: { id: roundId },
    limit: 1,
  });

  if (!rounds || rounds.length === 0 || rounds[0].status !== "open") {
    return false;
  }

  const round = rounds[0];
  const closesAt = new Date(round.submissions_close_at).getTime();
  const now = Date.now();

  if (now < closesAt) {
    return false;
  }

  await pokerDb.update("weekend_game_rounds", { id: roundId }, {
    status: "closed",
    closed_at: new Date().toISOString(),
  });

  return true;
}

/**
 * Auto-close all open rounds where submissions_close_at has passed.
 * Called from GET /api/weekend-game/rounds/active.
 */
export async function autoCloseWeekendGameRounds(): Promise<number> {
  const openRounds = await pokerDb.fetch<{ id: string }>(
    "weekend_game_rounds",
    { filters: { status: "open" }, select: "id", limit: 100 }
  );

  if (!openRounds || openRounds.length === 0) {
    return 0;
  }

  let closed = 0;
  for (const round of openRounds) {
    if (await maybeCloseWeekendGameRound(round.id)) {
      closed++;
    }
  }

  return closed;
}
