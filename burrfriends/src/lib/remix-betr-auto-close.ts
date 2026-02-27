/**
 * Auto-close logic for REMIX BETR rounds.
 * When status is 'open' and submissions_close_at has passed, set status to 'closed'.
 * Same pattern as betr-guesser-auto-close.ts.
 */

import { pokerDb } from "~/lib/pokerDb";

export async function maybeCloseRemixBetrRound(roundId: string): Promise<boolean> {
  const rounds = await pokerDb.fetch<{
    id: string;
    status: string;
    submissions_close_at: string;
  }>("remix_betr_rounds", {
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

  // Time has passed, close the round
  const iso = new Date().toISOString();
  await pokerDb.update("remix_betr_rounds", { id: roundId }, {
    status: "closed",
    closed_at: iso,
    updated_at: iso,
  });

  return true;
}

/**
 * Auto-close all open rounds where submissions_close_at has passed.
 * Called from GET /api/remix-betr/rounds/active.
 */
export async function autoCloseRemixBetrRounds(): Promise<number> {
  const openRounds = await pokerDb.fetch<{ id: string }>(
    "remix_betr_rounds",
    { filters: { status: "open" }, select: "id", limit: 100 }
  );

  if (!openRounds || openRounds.length === 0) {
    return 0;
  }

  let closed = 0;
  for (const round of openRounds) {
    if (await maybeCloseRemixBetrRound(round.id)) {
      closed++;
    }
  }

  return closed;
}
