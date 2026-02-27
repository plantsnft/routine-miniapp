/**
 * Game utility functions for shared game logic
 */

import type { Game } from './types';
import { computeRegistrationCloseAt, isRegistrationOpen, hasGameStarted, getEffectiveMaxParticipants } from './game-registration';

/**
 * Normalize game fields to ensure consistent API response shape.
 * Handles both legacy (buy_in_*) and new (entry_fee_*, gating_type) field names.
 * 
 * Normalization rules:
 * - gating_type: if missing/null, infer "entry_fee" when buy_in_amount > 0 AND buy_in_currency exists
 * - entry_fee_amount: prefer entry_fee_amount if present else fallback to buy_in_amount
 * - entry_fee_currency: prefer entry_fee_currency if present else fallback to buy_in_currency
 * - Always includes: gating_type, entry_fee_amount, entry_fee_currency in response
 */
export function normalizeGame(gameRow: any): Game {
  const hasEntryFee = gameRow.entry_fee_amount || gameRow.buy_in_amount;
  const hasCurrency = gameRow.entry_fee_currency || gameRow.buy_in_currency;
  const entryFeeAmount = parseFloat(String(gameRow.entry_fee_amount || gameRow.buy_in_amount || 0));
  const entryFeeCurrency = gameRow.entry_fee_currency || gameRow.buy_in_currency || null;
  
  // Infer gating_type: "entry_fee" if amount > 0 AND currency exists, else use existing or default to "open"
  let gatingType = gameRow.gating_type;
  if (!gatingType && entryFeeAmount > 0 && entryFeeCurrency) {
    gatingType = 'entry_fee';
  } else if (!gatingType) {
    gatingType = 'open';
  }

  return {
    ...gameRow,
    gating_type: gatingType,
    entry_fee_amount: entryFeeAmount > 0 ? entryFeeAmount : null,
    entry_fee_currency: entryFeeCurrency,
    // Keep legacy fields for backward compatibility
    buy_in_amount: gameRow.buy_in_amount || null,
    buy_in_currency: gameRow.buy_in_currency || null,
    // Include new fields if present
    game_type: gameRow.game_type || 'standard',
    registration_close_minutes: gameRow.registration_close_minutes ?? 0,
  } as Game;
}

/**
 * Enrich game object with computed registration status fields
 * 
 * @param game - Game object (normalized)
 * @param currentParticipantCount - Current number of participants
 * @returns Game object with computed fields: registrationCloseAt, registrationOpen, hasStarted, effectiveMaxParticipants, spotsOpen
 */
export function enrichGameWithRegistrationStatus(
  game: Game | any,
  currentParticipantCount: number
): Game & { 
  registrationCloseAt?: string | null; 
  registrationOpen?: boolean; 
  hasStarted?: boolean;
  effectiveMaxParticipants?: number | null;
  spotsOpen?: number | null;
} {
  const registrationCloseAt = computeRegistrationCloseAt({
    game_type: (game as any).game_type || game.game_type,
    registration_close_minutes: (game as any).registration_close_minutes ?? game.registration_close_minutes ?? 0,
    scheduled_time: (game as any).scheduled_time || game.scheduled_time,
    game_date: (game as any).game_date || (game as any).scheduled_time || game.scheduled_time,
  });
  
  const registrationStatus = isRegistrationOpen(
    {
      status: (game as any).status || game.status,
      game_type: (game as any).game_type || game.game_type || 'standard',
      registration_close_minutes: (game as any).registration_close_minutes ?? game.registration_close_minutes ?? 0,
      scheduled_time: (game as any).scheduled_time || game.scheduled_time,
      game_date: (game as any).game_date || (game as any).scheduled_time || game.scheduled_time,
      max_participants: (game as any).max_participants || game.max_participants,
    },
    currentParticipantCount
  );
  
  const gameStarted = hasGameStarted({
    scheduled_time: (game as any).scheduled_time || game.scheduled_time,
    game_date: (game as any).game_date || (game as any).scheduled_time || game.scheduled_time,
  });
  
  // Calculate effective max participants (99 for open-registration large_event)
  const effectiveMax = getEffectiveMaxParticipants({
    game_type: (game as any).game_type || game.game_type || 'standard',
    max_participants: (game as any).max_participants ?? game.max_participants,
  });
  
  // Calculate spots open
  const spotsOpen = effectiveMax !== null && effectiveMax !== undefined
    ? Math.max(effectiveMax - currentParticipantCount, 0)
    : null;
  
  return {
    ...game,
    registrationCloseAt,
    registrationOpen: registrationStatus.isOpen,
    hasStarted: gameStarted,
    effectiveMaxParticipants: effectiveMax,
    spotsOpen,
  } as Game & { 
    registrationCloseAt?: string | null; 
    registrationOpen?: boolean; 
    hasStarted?: boolean;
    effectiveMaxParticipants?: number | null;
    spotsOpen?: number | null;
  };
}

/**
 * Check if a game is a paid game (entry fee required).
 * Works with normalized game objects and does NOT require gating_type to be present.
 * 
 * Returns true when ANY of these are true:
 * - (normalized.entry_fee_amount > 0 AND currency is USDC)
 * - OR (buy_in_amount > 0 AND buy_in_currency is USDC)
 * - OR gating_type === 'entry_fee' (if present)
 * 
 * Currency check is case-insensitive and allows "USDC" / "usdc".
 */
export function isPaidGame(game: Game | any): boolean {
  // Normalize if needed (in case raw DB row is passed)
  const normalized = (game as any).gating_type !== undefined ? game : normalizeGame(game);
  
  const entryFeeAmount = normalized.entry_fee_amount || (normalized as any).buy_in_amount || 0;
  const entryFeeCurrency = (normalized.entry_fee_currency || (normalized as any).buy_in_currency || '').toUpperCase();
  const gatingType = normalized.gating_type || (normalized as any).gating_type;
  
  // Check if currency is USDC (case-insensitive)
  const isUSDC = entryFeeCurrency === 'USDC';
  
  // Return true if:
  // 1. Has entry fee amount > 0 AND currency is USDC
  // 2. OR gating_type is 'entry_fee' (if present)
  return (entryFeeAmount > 0 && isUSDC) || gatingType === 'entry_fee';
}

