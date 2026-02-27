/**
 * NL HOLDEM hand evaluator adapter. Phase 40.
 * Uses @pokertools/evaluator (no HandRanks.dat; Vercel/serverless compatible).
 * Card format: two-char e.g. "Ah", "Kd", "Ts" (T = ten).
 */

import { evaluateStrings } from "@pokertools/evaluator";

/** Normalize our card code: ensure uppercase rank + lowercase suit for library. */
function toEvalFormat(card: string): string {
  const s = String(card).trim();
  if (s.length < 2) return s;
  const rank = s.slice(0, -1).toUpperCase();
  const suit = s.slice(-1).toLowerCase();
  return rank + suit;
}

/**
 * Returns comparable hand value (lower = better) for 5–7 cards.
 * Cards in our format: e.g. ["Ah", "Kd", "Qc", "Js", "Th", "2d", "3c"].
 */
export function rankHand(cards: string[]): number {
  if (cards.length < 5 || cards.length > 7) return 0;
  const formatted = cards.map(toEvalFormat);
  return evaluateStrings(formatted);
}

/**
 * Given hole cards per fid (2 cards each) and community cards (5), return fids with the best hand (winners).
 * Ties return multiple fids (split pot).
 * @pokertools: lower score = better hand.
 */
export function getWinningFids(
  holeCardsByFid: Map<number, string[]>,
  communityCards: string[]
): number[] {
  if (communityCards.length !== 5) return [];
  let bestScore = Number.MAX_SAFE_INTEGER;
  const winners: number[] = [];
  for (const [fid, holeCards] of holeCardsByFid) {
    if (holeCards.length !== 2) continue;
    const seven = [...holeCards, ...communityCards];
    const score = rankHand(seven);
    if (score < bestScore) {
      bestScore = score;
      winners.length = 0;
      winners.push(fid);
    } else if (score === bestScore) {
      winners.push(fid);
    }
  }
  return winners;
}
