/**
 * Builds title and body for "game has started" push notifications.
 * Used by both join route (table full) and cron (scheduled time).
 * Body format matches game-creation notifications (prize/buy-in, players, staking).
 * Farcaster body max 128 chars; we truncate here.
 */

import { formatPrizeAmount, formatPrizeWithCurrency } from './format-prize';

const MAX_BODY_LENGTH = 128;
const PASSWORD_HINT = ' Open app for password.';

export type GameLike = {
  name?: string | null;
  prize_amounts?: number[] | null;
  prize_currency?: string | null;
  max_participants?: number | null;
  staking_min_amount?: number | null;
  buy_in_amount?: number | null;
  buy_in_currency?: string | null;
  entry_fee_amount?: number | null;
  entry_fee_currency?: string | null;
};

export interface BuildGameStartedPayloadOptions {
  passwordHint?: boolean;
}

/**
 * Returns { title, body } for game-started notification.
 * Title is always "Game has started". Body includes game info (same format as game-creation).
 */
export function buildGameStartedPayload(
  game: GameLike,
  participantCount: number,
  options?: BuildGameStartedPayloadOptions
): { title: string; body: string } {
  const title = 'Game has started';

  const maxParticipants = game.max_participants != null ? Number(game.max_participants) : null;
  const stakingMinAmount = game.staking_min_amount != null ? Number(game.staking_min_amount) : null;
  const hasStakingRequirement = stakingMinAmount != null && stakingMinAmount > 0;
  const stakingText = hasStakingRequirement
    ? ` Staking: ${formatPrizeAmount(stakingMinAmount)} BETR required.`
    : '';

  const prizeAmounts = game.prize_amounts;
  const isPrizeBasedGame = Array.isArray(prizeAmounts) && prizeAmounts.length > 0;

  let body: string;

  if (isPrizeBasedGame && prizeAmounts) {
    const totalPrize = prizeAmounts.reduce((sum, amt) => sum + Number(amt || 0), 0);
    const prizeCurrency = game.prize_currency || 'BETR';
    const prizeText = formatPrizeWithCurrency(totalPrize, prizeCurrency);
    body = maxParticipants != null
      ? `Prize: ${prizeText}. Players: ${participantCount}/${maxParticipants}.${stakingText}`
      : `Prize: ${prizeText}. Open to all players.${stakingText}`;
  } else {
    const buyInAmount = game.buy_in_amount ?? game.entry_fee_amount ?? 0;
    const buyInCurrency = game.buy_in_currency ?? game.entry_fee_currency ?? 'USDC';
    const formattedAmount =
      typeof buyInAmount === 'number' && buyInAmount > 0
        ? buyInAmount.toFixed(2)
        : parseFloat(String(buyInAmount || 0)).toFixed(2);
    body = maxParticipants != null
      ? `Buy-in: ${formattedAmount} ${buyInCurrency}. Players: ${participantCount}/${maxParticipants}.${stakingText}`
      : `Buy-in: ${formattedAmount} ${buyInCurrency}. Open to all players.${stakingText}`;
  }

  if (options?.passwordHint) {
    if (body.length + PASSWORD_HINT.length <= MAX_BODY_LENGTH) {
      body += PASSWORD_HINT;
    } else {
      body = body.slice(0, MAX_BODY_LENGTH - PASSWORD_HINT.length).trim() + PASSWORD_HINT;
    }
  }

  body = body.slice(0, MAX_BODY_LENGTH);
  return { title, body };
}
