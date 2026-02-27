/**
 * Auto-close logic for BETR GUESSER games.
 * When status is 'open' and (guesses_close_at passed OR guess_count >= min_players_to_start per start_condition),
 * set status to 'closed'.
 */

import { pokerDb } from "~/lib/pokerDb";

export const MAX_BETR_GUESSER_GUESSES = 99;

export async function maybeCloseBetrGuesserGame(gameId: string): Promise<boolean> {
  const games = await pokerDb.fetch<{
    id: string;
    status: string;
    guesses_close_at: string;
    min_players_to_start?: number | null;
    start_condition?: string | null;
  }>("betr_guesser_games", {
    filters: { id: gameId },
    limit: 1,
  });
  if (!games || games.length === 0 || games[0].status !== "open") return false;

  const game = games[0];
  const guesses = await pokerDb.fetch<{ id: string }>("betr_guesser_guesses", {
    filters: { game_id: gameId },
    limit: MAX_BETR_GUESSER_GUESSES + 1,
  });
  const count = guesses?.length ?? 0;
  const closesAt = new Date(game.guesses_close_at).getTime();
  const now = Date.now();
  const sc = game.start_condition ?? "at_time";
  const minN = game.min_players_to_start != null ? Number(game.min_players_to_start) : null;

  let shouldClose = false;
  if (now >= closesAt) shouldClose = true;
  else if (sc === "min_players" && minN != null && count >= minN) shouldClose = true;
  else if (sc === "whichever_first" && minN != null && (count >= minN || now >= closesAt)) shouldClose = true;

  if (!shouldClose) return false;

  const iso = new Date().toISOString();
  await pokerDb.update("betr_guesser_games", { id: gameId }, { status: "closed", updated_at: iso });
  return true;
}
