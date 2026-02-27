/**
 * Auto-start logic for BETR signup games (THE MOLE, BUDDY UP).
 * When status is 'signup' and (min_players reached OR signup_closes_at passed per start_condition),
 * set status to 'in_progress' and started_at.
 */

import { pokerDb } from "~/lib/pokerDb";

const MAX_SIGNUPS = 99;

export async function checkAndAutoStartMoleGame(gameId: string): Promise<void> {
  const games = await pokerDb.fetch<{
    status: string;
    min_players_to_start?: number | null;
    signup_closes_at?: string | null;
    start_condition?: string | null;
  }>("mole_games", { filters: { id: gameId }, limit: 1 });
  if (!games || games.length === 0) return;
  const game = games[0];
  if (game.status !== "signup") return;

  const signups = await pokerDb.fetch<{ id: string }>("mole_signups", {
    filters: { game_id: gameId },
    limit: MAX_SIGNUPS + 1,
  });
  const count = signups?.length ?? 0;

  const sc = game.start_condition ?? null;
  const minN = game.min_players_to_start != null ? Number(game.min_players_to_start) : null;
  const closesAt = game.signup_closes_at ? new Date(game.signup_closes_at).getTime() : null;
  const now = Date.now();

  let shouldStart = false;
  if (sc === "min_players" && minN != null && count >= minN) shouldStart = true;
  else if (sc === "at_time" && closesAt != null && now >= closesAt) shouldStart = true;
  else if (sc === "whichever_first") {
    if (minN != null && count >= minN) shouldStart = true;
    else if (closesAt != null && now >= closesAt) shouldStart = true;
  }
  if (!shouldStart) return;

  const iso = new Date().toISOString();
  await pokerDb.update(
    "mole_games",
    { id: gameId },
    { status: "in_progress", started_at: iso, updated_at: iso }
  );
}

export async function checkAndAutoStartBuddyUpGame(gameId: string): Promise<void> {
  const games = await pokerDb.fetch<{
    status: string;
    min_players_to_start?: number | null;
    signup_closes_at?: string | null;
    start_condition?: string | null;
  }>("buddy_up_games", { filters: { id: gameId }, limit: 1 });
  if (!games || games.length === 0) return;
  const game = games[0];
  if (game.status !== "signup") return;

  const signups = await pokerDb.fetch<{ id: string }>("buddy_up_signups", {
    filters: { game_id: gameId },
    limit: MAX_SIGNUPS + 1,
  });
  const count = signups?.length ?? 0;

  const sc = game.start_condition ?? null;
  const minN = game.min_players_to_start != null ? Number(game.min_players_to_start) : null;
  const closesAt = game.signup_closes_at ? new Date(game.signup_closes_at).getTime() : null;
  const now = Date.now();

  let shouldStart = false;
  if (sc === "min_players" && minN != null && count >= minN) shouldStart = true;
  else if (sc === "at_time" && closesAt != null && now >= closesAt) shouldStart = true;
  else if (sc === "whichever_first") {
    if (minN != null && count >= minN) shouldStart = true;
    else if (closesAt != null && now >= closesAt) shouldStart = true;
  }
  if (!shouldStart) return;

  const iso = new Date().toISOString();
  await pokerDb.update(
    "buddy_up_games",
    { id: gameId },
    { status: "in_progress", started_at: iso, updated_at: iso }
  );
}

export { MAX_SIGNUPS };
