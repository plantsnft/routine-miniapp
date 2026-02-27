/**
 * NL HOLDEM play: init stacks + first hand, deal new hands. Phase 40.
 * All randomness via crypto (shuffleWithCrypto from nlHoldemStart).
 * Turn timer: setActorEndsAt(handId) sets actor_ends_at when actor is set (deal, act, advance).
 * Blinds: time-based level from started_at + blind_duration_minutes.
 */

import { pokerDb } from "~/lib/pokerDb";
import { shuffleWithCrypto } from "~/lib/nlHoldemStart";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["h", "d", "c", "s"];

const TURN_SECONDS = 40;

/** Time-based blind level and amounts. started_at null => level 1. */
export function getBlindLevelForGame(game: {
  started_at?: string | null;
  blind_duration_minutes?: number | null;
  blind_increase_pct?: number | null;
  starting_small_blind?: number | null;
}): { level: number; smallBlind: number; bigBlind: number; nextBlindRaiseAt: string | null } {
  const startedAt = game.started_at ? new Date(game.started_at).getTime() : null;
  const durationMin = Number(game.blind_duration_minutes) || 10;
  const increasePct = Number(game.blind_increase_pct) || 25;
  const startSb = Number(game.starting_small_blind) || 10;
  if (startedAt == null || startedAt > Date.now()) {
    return {
      level: 1,
      smallBlind: startSb,
      bigBlind: startSb * 2,
      nextBlindRaiseAt: null,
    };
  }
  const elapsedSec = (Date.now() - startedAt) / 1000;
  const level = 1 + Math.floor(elapsedSec / (durationMin * 60));
  const smallBlind = Math.round(startSb * Math.pow(1 + increasePct / 100, level - 1));
  const bigBlind = smallBlind * 2;
  const nextRaiseAtMs = startedAt + level * durationMin * 60 * 1000;
  return {
    level,
    smallBlind,
    bigBlind,
    nextBlindRaiseAt: new Date(nextRaiseAtMs).toISOString(),
  };
}

/**
 * Compute current actor for hand from DB state (same logic as GET/act).
 * Returns actor FID or null if hand complete / no actor.
 */
export async function getCurrentActor(handId: string): Promise<number | null> {
  const hands = await pokerDb.fetch<{
    game_id: string;
    current_street: string;
    current_bet: number;
    dealer_seat_index: number;
    bb_seat_index: number;
    status: string;
  }>("nl_holdem_hands", { filters: { id: handId }, limit: 1 });
  if (!hands?.length || !["active", "showdown"].includes(hands[0].status)) return null;
  const hand = hands[0];
  const gameId = hand.game_id;
  const games = await pokerDb.fetch<{ seat_order_fids: number[] }>("nl_holdem_games", {
    filters: { id: gameId },
    limit: 1,
  });
  if (!games?.length) return null;
  const seatOrderFids = (games[0].seat_order_fids ?? []).map(Number).filter((f) => f > 0);
  const N = seatOrderFids.length;
  if (N < 2) return null;
  const actions = await pokerDb.fetch<{ fid: number; action_type: string; amount: number; street: string }>(
    "nl_holdem_hand_actions",
    { filters: { hand_id: handId }, order: "sequence.asc", limit: 200 }
  );
  const holeRows = await pokerDb.fetch<{ fid: number }>("nl_holdem_hole_cards", {
    filters: { hand_id: handId },
    limit: 10,
  });
  const activeFids = new Set((holeRows ?? []).map((r) => Number(r.fid)));
  const foldedFids = new Set<number>();
  const putThisStreetByFid = new Map<number, number>();
  const currentStreet = hand.current_street;
  const currentBet = Number(hand.current_bet) || 0;
  for (const a of actions ?? []) {
    if (a.action_type === "fold") foldedFids.add(Number(a.fid));
    if (String(a.street) === currentStreet) {
      const f = Number(a.fid);
      putThisStreetByFid.set(f, (putThisStreetByFid.get(f) ?? 0) + Number(a.amount));
    }
  }
  foldedFids.forEach((f) => activeFids.delete(f));
  if (activeFids.size < 2) return null;
  const dealerSeatIndex = Number(hand.dealer_seat_index) || 0;
  const bbSeatIndex = Number(hand.bb_seat_index) || 0;
  const firstToActSeat = currentStreet === "preflop" ? (bbSeatIndex + 1) % N : (dealerSeatIndex + 1) % N;
  for (let i = 0; i < N; i++) {
    const seatIdx = (firstToActSeat + i) % N;
    const f = seatOrderFids[seatIdx];
    if (!activeFids.has(f)) continue;
    const putIn = putThisStreetByFid.get(f) ?? 0;
    if (putIn < currentBet) return f;
  }
  for (let i = 0; i < N; i++) {
    const seatIdx = (firstToActSeat + i) % N;
    const f = seatOrderFids[seatIdx];
    if (activeFids.has(f)) return f;
  }
  return null;
}

/**
 * Set actor_ends_at on hand to now + TURN_SECONDS for current actor, or null if none.
 */
export async function setActorEndsAt(handId: string): Promise<void> {
  const actorFid = await getCurrentActor(handId);
  const endsAt = actorFid != null ? new Date(Date.now() + TURN_SECONDS * 1000).toISOString() : null;
  await pokerDb.update("nl_holdem_hands", { id: handId }, { actor_ends_at: endsAt });
}

function buildDeck(): string[] {
  const deck: string[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(r + s);
    }
  }
  return deck;
}

/**
 * Ensure stacks exist for the game and deal the first (or next) hand.
 * Call only when game has just transitioned to in_progress (startGameWhenFull returned non-null).
 */
export async function initPlayForGame(gameId: string): Promise<void> {
  const games = await pokerDb.fetch<{
    seat_order_fids: number[];
    starting_stacks: number;
    starting_small_blind: number;
  }>("nl_holdem_games", {
    filters: { id: gameId },
    limit: 1,
  });
  if (!games?.length) return;
  const game = games[0];
  const seatOrderFids = Array.isArray(game.seat_order_fids)
    ? game.seat_order_fids.map(Number).filter((f) => f > 0)
    : [];
  if (seatOrderFids.length < 2) return;

  const existingStacks = await pokerDb.fetch<{ game_id: string }>("nl_holdem_stacks", {
    filters: { game_id: gameId },
    limit: 1,
  });
  if (!existingStacks?.length) {
    const startingStacks = Number(game.starting_stacks) || 1500;
    await pokerDb.insert(
      "nl_holdem_stacks",
      seatOrderFids.map((fid) => ({
        game_id: gameId,
        fid,
        stack: startingStacks,
      }))
    );
  }

  await dealHand(gameId);
}

/**
 * Create a new hand: shuffle 52 cards, assign hole cards, post blinds.
 * No-op if an active hand already exists. BB = 2 * SB.
 */
export async function dealHand(gameId: string): Promise<void> {
  const games = await pokerDb.fetch<{
    seat_order_fids: number[];
    starting_small_blind: number;
    started_at?: string | null;
    blind_duration_minutes?: number | null;
    blind_increase_pct?: number | null;
  }>("nl_holdem_games", {
    filters: { id: gameId },
    limit: 1,
  });
  if (!games?.length) return;
  const game = games[0];
  const seatOrderFids = Array.isArray(game.seat_order_fids)
    ? game.seat_order_fids.map(Number).filter((f) => f > 0)
    : [];
  if (seatOrderFids.length < 2) return;

  const stacks = await pokerDb.fetch<{ fid: number; stack: number }>("nl_holdem_stacks", {
    filters: { game_id: gameId },
    limit: 20,
  });
  const stackByFid = new Map<number, number>();
  for (const row of stacks || []) {
    const s = Number(row.stack);
    if (s > 0) stackByFid.set(Number(row.fid), s);
  }

  const recentHands = await pokerDb.fetch<{ id: string; status: string }>("nl_holdem_hands", {
    filters: { game_id: gameId },
    order: "created_at.desc",
    limit: 1,
  });
  if (recentHands?.length && ["active", "showdown"].includes(recentHands[0].status)) return;

  const completedHands = await pokerDb.fetch<{ hand_number: number }>("nl_holdem_hands", {
    filters: { game_id: gameId, status: "complete" },
    select: "hand_number",
    limit: 1000,
  });
  const handNumber = (completedHands?.length ?? 0) + 1;
  const N = seatOrderFids.length;
  const dealerSeatIndex = (handNumber - 1) % N;
  const sbSeatIndex = (dealerSeatIndex + 1) % N;
  const bbSeatIndex = (dealerSeatIndex + 2) % N;
  const sbFid = seatOrderFids[sbSeatIndex];
  const bbFid = seatOrderFids[bbSeatIndex];

  const { smallBlind, bigBlind } = getBlindLevelForGame(game);

  const deck = shuffleWithCrypto(buildDeck());
  let deckIndex = 0;
  const holeCardsByFid: Array<{ fid: number; cards: string[] }> = [];
  for (let i = 0; i < seatOrderFids.length; i++) {
    const fid = seatOrderFids[i];
    if (!stackByFid.has(fid)) continue;
    const cards = [deck[deckIndex], deck[deckIndex + 1]];
    deckIndex += 2;
    holeCardsByFid.push({ fid, cards });
  }
  const deckRemainder = deck.slice(deckIndex);

  const handRows = await pokerDb.insert<Record<string, unknown>, { id: string }>("nl_holdem_hands", [
    {
      game_id: gameId,
      hand_number: handNumber,
      dealer_seat_index: dealerSeatIndex,
      sb_seat_index: sbSeatIndex,
      bb_seat_index: bbSeatIndex,
      community_cards: [],
      deck_remainder: deckRemainder,
      pot: 0,
      current_street: "preflop",
      current_bet: bigBlind,
      min_raise: bigBlind,
      status: "active",
    },
  ]);
  const handId = handRows?.[0]?.id;
  if (!handId) return;

  for (const { fid, cards } of holeCardsByFid) {
    await pokerDb.insert("nl_holdem_hole_cards", [{ hand_id: handId, fid, cards }]);
  }

  let pot = 0;
  const sbStack = stackByFid.get(sbFid) ?? 0;
  const bbStack = stackByFid.get(bbFid) ?? 0;
  const sbPost = Math.min(sbStack, smallBlind);
  const bbPost = Math.min(bbStack, bigBlind);
  pot = sbPost + bbPost;

  await pokerDb.update("nl_holdem_stacks", { game_id: gameId, fid: sbFid }, { stack: sbStack - sbPost });
  await pokerDb.update("nl_holdem_stacks", { game_id: gameId, fid: bbFid }, { stack: bbStack - bbPost });
  await pokerDb.update("nl_holdem_hands", { id: handId }, { pot });

  const actions: Array<{ hand_id: string; fid: number; action_type: string; amount: number; sequence: number; street: string }> = [
    { hand_id: handId, fid: sbFid, action_type: "post_sb", amount: sbPost, sequence: 1, street: "preflop" },
    { hand_id: handId, fid: bbFid, action_type: "post_bb", amount: bbPost, sequence: 2, street: "preflop" },
  ];
  await pokerDb.insert("nl_holdem_hand_actions", actions);
  await setActorEndsAt(handId);
}

/**
 * Advance hand to next street: append community cards from deck_remainder, reset current_bet.
 * preflop -> flop (3), flop -> turn (1), turn -> river (1).
 */
export async function advanceStreet(handId: string): Promise<void> {
  const hands = await pokerDb.fetch<{
    id: string;
    current_street: string;
    community_cards: string[];
    deck_remainder: string[];
    game_id: string;
  }>("nl_holdem_hands", { filters: { id: handId }, limit: 1 });
  if (!hands?.length) return;
  const hand = hands[0];
  const community = Array.isArray(hand.community_cards) ? [...hand.community_cards] : [];
  const remainder = Array.isArray(hand.deck_remainder) ? [...hand.deck_remainder] : [];
  let nextStreet: string;
  if (hand.current_street === "preflop") {
    nextStreet = "flop";
    for (let i = 0; i < 3 && remainder.length; i++) community.push(remainder.shift()!);
  } else if (hand.current_street === "flop") {
    nextStreet = "turn";
    if (remainder.length) community.push(remainder.shift()!);
  } else if (hand.current_street === "turn") {
    nextStreet = "river";
    if (remainder.length) community.push(remainder.shift()!);
  } else {
    return;
  }
  await pokerDb.update("nl_holdem_hands", { id: handId }, {
    community_cards: community,
    deck_remainder: remainder,
    current_street: nextStreet,
    current_bet: 0,
  });
  await setActorEndsAt(handId);
}

/**
 * Apply timeout fold for current actor (cron). Inserts fold, then winner/advance/showdown/setActorEndsAt.
 * Returns true if a fold was applied.
 */
export async function applyTimeoutFold(handId: string): Promise<boolean> {
  const actorFid = await getCurrentActor(handId);
  if (actorFid == null) return false;

  const hands = await pokerDb.fetch<{
    game_id: string;
    current_street: string;
    current_bet: number;
    pot: number;
    min_raise: number;
  }>("nl_holdem_hands", { filters: { id: handId }, limit: 1 });
  if (!hands?.length) return false;
  const hand = hands[0];
  const gameId = hand.game_id;
  const currentStreet = hand.current_street;
  const currentBet = Number(hand.current_bet) || 0;
  const newPot = Number(hand.pot) || 0;
  const newCurrentBet = currentBet;
  const newMinRaise = Number(hand.min_raise) || 0;

  const games = await pokerDb.fetch<{ seat_order_fids: number[] }>("nl_holdem_games", {
    filters: { id: gameId },
    limit: 1,
  });
  if (!games?.length) return false;
  const seatOrderFids = (games[0].seat_order_fids ?? []).map(Number).filter((f) => f > 0);
  const N = seatOrderFids.length;
  if (N < 2) return false;

  const actions = await pokerDb.fetch<{ fid: number; action_type: string; amount: number; sequence: number; street: string }>(
    "nl_holdem_hand_actions",
    { filters: { hand_id: handId }, order: "sequence.asc", limit: 200 }
  );
  const holeRows = await pokerDb.fetch<{ fid: number }>("nl_holdem_hole_cards", {
    filters: { hand_id: handId },
    limit: 10,
  });
  const activeFids = new Set((holeRows ?? []).map((r) => Number(r.fid)));
  const foldedFids = new Set<number>();
  const putThisStreetByFid = new Map<number, number>();
  let maxSequence = 0;
  for (const a of actions ?? []) {
    maxSequence = Math.max(maxSequence, Number(a.sequence));
    if (a.action_type === "fold") foldedFids.add(Number(a.fid));
    if (String(a.street) === currentStreet) {
      const f = Number(a.fid);
      putThisStreetByFid.set(f, (putThisStreetByFid.get(f) ?? 0) + Number(a.amount));
    }
  }
  foldedFids.add(actorFid);
  activeFids.delete(actorFid);
  const nextSequence = maxSequence + 1;
  await pokerDb.insert("nl_holdem_hand_actions", [
    {
      hand_id: handId,
      fid: actorFid,
      action_type: "fold",
      amount: 0,
      sequence: nextSequence,
      street: currentStreet,
    },
  ]);

  const activeRemaining = seatOrderFids.filter((f) => activeFids.has(f) && !foldedFids.has(f));
  if (activeRemaining.length === 1) {
    const winnerFid = activeRemaining[0];
    const winnerStacks = await pokerDb.fetch<{ stack: number }>("nl_holdem_stacks", {
      filters: { game_id: gameId, fid: winnerFid },
      limit: 1,
    });
    const winnerStack = winnerStacks?.[0] ? Number(winnerStacks[0].stack) : 0;
    await pokerDb.update("nl_holdem_stacks", { game_id: gameId, fid: winnerFid }, { stack: winnerStack + newPot });
    await pokerDb.update("nl_holdem_hands", { id: handId }, { status: "complete" });
    const stacksAfter = await pokerDb.fetch<{ fid: number; stack: number }>("nl_holdem_stacks", {
      filters: { game_id: gameId },
      limit: 20,
    });
    const withChips = (stacksAfter ?? []).filter((r) => Number(r.stack) > 0).length;
    if (withChips >= 2) await dealHand(gameId);
    return true;
  }

  const putAfter = new Map(putThisStreetByFid);
  const allMatched = activeRemaining.every((f) => (putAfter.get(f) ?? 0) >= newCurrentBet);
  if (allMatched) {
    if (currentStreet === "river") {
      await runShowdown(handId);
      const stacksAfter = await pokerDb.fetch<{ stack: number }>("nl_holdem_stacks", {
        filters: { game_id: gameId },
        limit: 20,
      });
      const withChips = (stacksAfter ?? []).filter((r) => Number(r.stack) > 0).length;
      if (withChips >= 2) await dealHand(gameId);
    } else {
      await advanceStreet(handId);
    }
  } else {
    await setActorEndsAt(handId);
  }
  return true;
}

/**
 * Resolve showdown: determine winner(s), award pot, set hand complete.
 */
export async function runShowdown(handId: string): Promise<void> {
  const hands = await pokerDb.fetch<{ id: string; game_id: string; pot: number }>("nl_holdem_hands", {
    filters: { id: handId },
    limit: 1,
  });
  if (!hands?.length) return;
  const hand = hands[0];
  const gameId = hand.game_id;
  const pot = Number(hand.pot) || 0;
  const holeRows = await pokerDb.fetch<{ fid: number; cards: string[] }>("nl_holdem_hole_cards", {
    filters: { hand_id: handId },
    limit: 10,
  });
  const handRows = await pokerDb.fetch<{ community_cards: string[] }>("nl_holdem_hands", {
    filters: { id: handId },
    select: "community_cards",
    limit: 1,
  });
  const communityCards = (handRows?.[0]?.community_cards ?? []) as string[];
  if (communityCards.length !== 5) return;

  const holeCardsByFid = new Map<number, string[]>();
  for (const row of holeRows || []) {
    const cards = Array.isArray(row.cards) ? row.cards : [];
    if (cards.length === 2) holeCardsByFid.set(Number(row.fid), cards);
  }
  const { getWinningFids } = await import("~/lib/nlHoldemHandEval");
  const winners = getWinningFids(holeCardsByFid, communityCards);
  if (winners.length === 0) return;

  const actionRows = await pokerDb.fetch<{ fid: number; action_type: string }>("nl_holdem_hand_actions", {
    filters: { hand_id: handId },
    select: "fid,action_type",
    limit: 100,
  });
  const foldedFids = new Set<number>();
  for (const a of actionRows ?? []) {
    if (a.action_type === "fold") foldedFids.add(Number(a.fid));
  }
  const toReveal: Array<{ hand_id: string; fid: number; cards: string[] }> = [];
  for (const [fid, cards] of holeCardsByFid) {
    if (foldedFids.has(fid) || !Array.isArray(cards) || cards.length !== 2) continue;
    toReveal.push({ hand_id: handId, fid, cards });
  }
  if (toReveal.length > 0) {
    await pokerDb.upsert("nl_holdem_hand_revealed_cards", toReveal);
  }

  const splitAmount = pot / winners.length;
  const stacks = await pokerDb.fetch<{ fid: number; stack: number }>("nl_holdem_stacks", {
    filters: { game_id: gameId },
    limit: 20,
  });
  for (const fid of winners) {
    const row = (stacks || []).find((r) => Number(r.fid) === fid);
    const current = row ? Number(row.stack) : 0;
    await pokerDb.update("nl_holdem_stacks", { game_id: gameId, fid }, { stack: current + splitAmount });
  }
  await pokerDb.update("nl_holdem_hands", { id: handId }, { status: "complete" });
}
