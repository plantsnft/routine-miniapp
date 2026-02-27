/**
 * Shared winner calculation logic for BETR GUESSER
 */

import { pokerDb } from "~/lib/pokerDb";

export type WinnerResult = {
  winnerFid: number;
  winnerGuess: number;
  guessCount: number;
} | null;

/**
 * Calculate the winner for a BETR GUESSER game.
 * Returns the highest unique guess (guess that only one person made).
 * Returns null if no unique guesses exist.
 */
export async function calculateBetrGuesserWinner(gameId: string): Promise<WinnerResult> {
  // Fetch all guesses
  const guesses = await pokerDb.fetch<{ guess: number; fid: number }>("betr_guesser_guesses", {
    filters: { game_id: gameId },
    select: "guess,fid",
    limit: 10000,
  });

  if (!guesses || guesses.length === 0) {
    return null;
  }

  // Group by guess, count occurrences
  const guessCounts = new Map<number, number[]>();
  for (const g of guesses) {
    if (!guessCounts.has(g.guess)) {
      guessCounts.set(g.guess, []);
    }
    guessCounts.get(g.guess)!.push(g.fid);
  }

  // Find unique guesses (count === 1)
  const uniqueGuesses: { guess: number; fid: number }[] = [];
  for (const [guess, fids] of guessCounts.entries()) {
    if (fids.length === 1) {
      uniqueGuesses.push({ guess, fid: fids[0] });
    }
  }

  if (uniqueGuesses.length === 0) {
    return null;
  }

  // Find highest unique guess
  const winner = uniqueGuesses.reduce((max, curr) => (curr.guess > max.guess ? curr : max));

  return {
    winnerFid: winner.fid,
    winnerGuess: winner.guess,
    guessCount: guesses.length,
  };
}
