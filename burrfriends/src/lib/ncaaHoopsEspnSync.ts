/**
 * Phase 41: NCAA HOOPS – ESPN sync. Fetches scoreboard for contest date range,
 * upserts ncaa_hoops_results (idempotent), then recomputes bracket cache (total_score, championship_correct).
 * On fetch/parse failure: do not clear or overwrite existing results; log and return.
 */

import { pokerDb } from "~/lib/pokerDb";
import { getPointsForMatchup, getRoundForMatchup, CHAMPIONSHIP_MATCHUP_ID } from "~/lib/ncaaHoops";

const ESPN_SCOREBOARD_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  competitions?: Array<{
    competitors?: Array<{
      id: string;
      team?: { displayName?: string };
      winner?: boolean;
    }>;
  }>;
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

function dateToParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Fetch completed events for a date range. Returns events sorted by date (oldest first), up to 63.
 */
async function fetchCompletedEvents(startDate: Date, endDate: Date): Promise<EspnEvent[]> {
  const out: EspnEvent[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dates = dateToParam(d);
    const url = `${ESPN_SCOREBOARD_BASE}?dates=${dates}&seasontype=3`;
    try {
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (!res.ok) continue;
      const data = (await res.json()) as EspnScoreboard;
      const events = data.events ?? [];
      for (const ev of events) {
        const comps = ev.competitions ?? [];
        const hasWinner = comps.some((c) =>
          (c.competitors ?? []).some((c) => c.winner === true)
        );
        if (hasWinner) out.push(ev);
      }
    } catch (e) {
      console.warn("[ncaaHoopsEspnSync] fetch day", dates, e);
    }
  }
  out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return out.slice(0, 63);
}

/**
 * From a completed ESPN event, get winner's team id (ESPN competitor id).
 */
function getWinnerTeamId(ev: EspnEvent): string | null {
  const comps = ev.competitions ?? [];
  for (const c of comps) {
    for (const comp of c.competitors ?? []) {
      if (comp.winner === true) return comp.id ?? null;
    }
  }
  return null;
}

/**
 * Sync results for one contest: fetch ESPN, map winner to slot, upsert results, refresh bracket cache.
 * Returns { resultsUpdated, error? }. On failure, does not clear existing results.
 */
export async function syncContestResults(contestId: string): Promise<{
  resultsUpdated: number;
  error?: string;
}> {
  const contestRows = await pokerDb.fetch<Record<string, unknown>>("ncaa_hoops_contests", {
    filters: { id: contestId },
    limit: 1,
  });
  const contest = contestRows?.[0] ?? null;
  if (!contest) {
    return { resultsUpdated: 0, error: "Contest not found" };
  }

  const startDate = contest.tournament_start_date as string | null;
  const endDate = contest.tournament_end_date as string | null;
  if (!startDate || !endDate) {
    return { resultsUpdated: 0, error: "Contest has no tournament date range" };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  let events: EspnEvent[];
  try {
    events = await fetchCompletedEvents(start, end);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ncaaHoopsEspnSync] fetch failed", contestId, msg);
    return { resultsUpdated: 0, error: `ESPN fetch failed: ${msg}` };
  }

  const slots = await pokerDb.fetch<{ slot_id: string; espn_team_id: string | null }>("ncaa_hoops_slots", {
    filters: { contest_id: contestId },
    select: "slot_id,espn_team_id",
  });
  const espnToSlot = new Map<string, string>();
  for (const s of slots ?? []) {
    if (s.espn_team_id) espnToSlot.set(s.espn_team_id, s.slot_id);
  }

  const existingResults = await pokerDb.fetch<{ matchup_id: number; winner_slot_id: string; round: number }>(
    "ncaa_hoops_results",
    { filters: { contest_id: contestId }, select: "matchup_id,winner_slot_id,round" }
  );
  const existingByMatchup = new Map<number, { winner_slot_id: string; round: number }>();
  for (const r of existingResults ?? []) {
    existingByMatchup.set(r.matchup_id, { winner_slot_id: r.winner_slot_id, round: r.round });
  }

  let resultsUpdated = 0;
  for (let i = 0; i < events.length; i++) {
    const matchupId = i + 1;
    const winnerTeamId = getWinnerTeamId(events[i]);
    if (!winnerTeamId) continue;
    const winnerSlotId = espnToSlot.get(winnerTeamId);
    if (!winnerSlotId) continue;
    const round = getRoundForMatchup(matchupId);
    const existing = existingByMatchup.get(matchupId);
    if (existing && existing.winner_slot_id === winnerSlotId) continue;

    if (existing) {
      await pokerDb.update(
        "ncaa_hoops_results",
        { contest_id: contestId, matchup_id: matchupId },
        { winner_slot_id: winnerSlotId, round }
      );
    } else {
      await pokerDb.insert("ncaa_hoops_results", [
        { contest_id: contestId, matchup_id: matchupId, winner_slot_id: winnerSlotId, round },
      ]);
    }
    resultsUpdated++;
  }

  await refreshBracketCache(contestId);

  return { resultsUpdated };
}

/**
 * Recompute total_score and championship_correct for every bracket in the contest and update ncaa_hoops_brackets.
 */
export async function refreshBracketCache(contestId: string): Promise<void> {
  const results = await pokerDb.fetch<{ matchup_id: number; winner_slot_id: string }>("ncaa_hoops_results", {
    filters: { contest_id: contestId },
    select: "matchup_id,winner_slot_id",
  });
  const resultByMatchup = new Map<number, string>();
  for (const r of results ?? []) resultByMatchup.set(r.matchup_id, r.winner_slot_id);

  const brackets = await pokerDb.fetch<{ id: string }>("ncaa_hoops_brackets", {
    filters: { contest_id: contestId },
    select: "id",
  });

  for (const b of brackets ?? []) {
    const picks = await pokerDb.fetch<{ matchup_id: number; winner_slot_id: string }>("ncaa_hoops_picks", {
      filters: { bracket_id: b.id },
      select: "matchup_id,winner_slot_id",
    });
    let totalScore = 0;
    let championshipCorrect = false;
    for (const p of picks ?? []) {
      const correctWinner = resultByMatchup.get(p.matchup_id);
      if (correctWinner && correctWinner === p.winner_slot_id) {
        totalScore += getPointsForMatchup(p.matchup_id);
        if (p.matchup_id === CHAMPIONSHIP_MATCHUP_ID) championshipCorrect = true;
      }
    }
    await pokerDb.update("ncaa_hoops_brackets", { id: b.id }, { total_score: totalScore, championship_correct: championshipCorrect });
  }
}
