/**
 * Auto-timeout logic for STEAL OR NO STEAL matches.
 * When status is 'active' and decision_deadline has passed, set status to 'timeout' and winner to player_a_fid.
 */

import { pokerDb } from "~/lib/pokerDb";

/**
 * Check and timeout a single match if deadline has passed.
 * Returns true if the match was timed out.
 */
export async function maybeTimeoutMatch(matchId: string): Promise<boolean> {
  const matches = await pokerDb.fetch<{
    id: string;
    status: string;
    decision_deadline: string;
    player_a_fid: number;
    player_b_fid: number;
    briefcase_label: string | null;
  }>("steal_no_steal_matches", {
    filters: { id: matchId },
    limit: 1,
  });

  if (!matches || matches.length === 0 || matches[0].status !== "active") {
    return false;
  }

  const match = matches[0];
  const deadline = new Date(match.decision_deadline).getTime();
  const now = Date.now();

  if (now < deadline) {
    return false;
  }

  // Deadline passed: YOU LOSE → decider wins; YOU WIN → holder wins
  const winnerFid = match.briefcase_label === "YOU WIN" ? match.player_a_fid : match.player_b_fid;
  const iso = new Date().toISOString();
  await pokerDb.update("steal_no_steal_matches", { id: matchId }, {
    status: "timeout",
    winner_fid: winnerFid,
    updated_at: iso,
  });

  return true;
}

/**
 * Auto-timeout all active matches where decision_deadline has passed.
 * Called from API endpoints that read matches.
 */
export async function autoTimeoutMatches(): Promise<number> {
  const activeMatches = await pokerDb.fetch<{ id: string }>(
    "steal_no_steal_matches",
    { filters: { status: "active" }, select: "id", limit: 200 }
  );

  if (!activeMatches || activeMatches.length === 0) {
    return 0;
  }

  let timedOut = 0;
  for (const match of activeMatches) {
    if (await maybeTimeoutMatch(match.id)) {
      timedOut++;
    }
  }

  return timedOut;
}

/**
 * Auto-timeout active matches for a specific round.
 * Called when completing a round.
 */
export async function autoTimeoutMatchesForRound(roundId: string): Promise<number> {
  const activeMatches = await pokerDb.fetch<{ id: string }>(
    "steal_no_steal_matches",
    { filters: { round_id: roundId, status: "active" }, select: "id", limit: 100 }
  );

  if (!activeMatches || activeMatches.length === 0) {
    return 0;
  }

  let timedOut = 0;
  const iso = new Date().toISOString();
  
  for (const match of activeMatches) {
    // Get match details to determine winner
    const matchDetails = await pokerDb.fetch<{
      id: string;
      player_a_fid: number;
      player_b_fid: number;
      briefcase_label: string | null;
    }>("steal_no_steal_matches", {
      filters: { id: match.id },
      limit: 1,
    });

    if (matchDetails && matchDetails.length > 0) {
      const m = matchDetails[0];
      const winnerFid = m.briefcase_label === "YOU WIN" ? m.player_a_fid : m.player_b_fid;
      await pokerDb.update("steal_no_steal_matches", { id: match.id }, {
        status: "timeout",
        winner_fid: winnerFid,
        updated_at: iso,
      });
      timedOut++;
    }
  }

  return timedOut;
}
