/**
 * POST /api/nl-holdem/games/[id]/act - Player action (fold/check/call/bet/raise). Phase 40.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { dealHand, advanceStreet, runShowdown, setActorEndsAt, getCurrentActor } from "~/lib/nlHoldemPlay";
import type { ApiResponse } from "~/lib/types";

type HandRow = {
  id: string;
  game_id: string;
  hand_number: number;
  dealer_seat_index: number;
  bb_seat_index: number;
  current_street: string;
  current_bet: number;
  min_raise: number;
  pot: number;
  status: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const amount = typeof body.amount === "number" ? body.amount : 0;
    if (!["fold", "check", "call", "bet", "raise"].includes(action)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid action" }, { status: 400 });
    }
    if ((action === "bet" || action === "raise") && amount <= 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Bet/raise requires amount > 0" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{ seat_order_fids: number[] }>("nl_holdem_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    const seatOrderFids = (games[0].seat_order_fids ?? []).map(Number).filter((f) => f > 0);
    const N = seatOrderFids.length;
    if (N < 2) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not ready" }, { status: 400 });
    }

    const hands = await pokerDb.fetch<HandRow>("nl_holdem_hands", {
      filters: { game_id: gameId },
      order: "created_at.desc",
      limit: 1,
    });
    const hand = hands?.[0];
    if (!hand || !["active", "showdown"].includes(hand.status)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No active hand" }, { status: 400 });
    }
    const handId = hand.id;
    const currentBet = Number(hand.current_bet) || 0;
    const minRaise = Number(hand.min_raise) || 0;
    const pot = Number(hand.pot) || 0;
    const dealerSeatIndex = Number(hand.dealer_seat_index) || 0;
    const bbSeatIndex = Number(hand.bb_seat_index) || 0;
    const currentStreet = String(hand.current_street);

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
    foldedFids.forEach((f) => activeFids.delete(f));
    const activeOrdered = seatOrderFids.filter((f) => activeFids.has(f));
    if (activeOrdered.length < 2) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Hand already resolved" }, { status: 400 });
    }

    const firstToActSeat = currentStreet === "preflop" ? (bbSeatIndex + 1) % N : (dealerSeatIndex + 1) % N;
    let currentActorFid: number | null = null;
    for (let i = 0; i < N; i++) {
      const seatIdx = (firstToActSeat + i) % N;
      const f = seatOrderFids[seatIdx];
      if (!activeFids.has(f)) continue;
      const putIn = putThisStreetByFid.get(f) ?? 0;
      if (putIn < currentBet) {
        currentActorFid = f;
        break;
      }
    }
    if (currentActorFid === null) {
      for (let i = 0; i < N; i++) {
        const seatIdx = (firstToActSeat + i) % N;
        const f = seatOrderFids[seatIdx];
        if (activeFids.has(f)) {
          currentActorFid = f;
          break;
        }
      }
    }
    // Pre-action: allow fold or check (when toCall=0) out-of-turn
    if (fid !== currentActorFid) {
      if (action === "fold" && activeFids.has(fid)) {
        const nextSeq = maxSequence + 1;
        await pokerDb.insert("nl_holdem_hand_actions", [
          { hand_id: handId, fid, action_type: "fold", amount: 0, sequence: nextSeq, street: currentStreet },
        ]);
        foldedFids.add(fid);
        activeFids.delete(fid);
        const activeRem = seatOrderFids.filter((f) => activeFids.has(f) && !foldedFids.has(f));
        if (activeRem.length === 1) {
          const winnerFid = activeRem[0];
          const winnerStacks = await pokerDb.fetch<{ stack: number }>("nl_holdem_stacks", { filters: { game_id: gameId, fid: winnerFid }, limit: 1 });
          const winnerStack = winnerStacks?.[0] ? Number(winnerStacks[0].stack) : 0;
          await pokerDb.update("nl_holdem_stacks", { game_id: gameId, fid: winnerFid }, { stack: winnerStack + pot });
          await pokerDb.update("nl_holdem_hands", { id: handId }, { status: "complete" });
          const stacksAfter = await pokerDb.fetch<{ fid: number; stack: number }>("nl_holdem_stacks", { filters: { game_id: gameId }, limit: 20 });
          const withChips = (stacksAfter ?? []).filter((r) => Number(r.stack) > 0).length;
          if (withChips >= 2) await dealHand(gameId);
        }
        return NextResponse.json<ApiResponse>({ ok: true, data: { handId, action: "fold" } });
      }
      if (action === "check" && activeFids.has(fid)) {
        const theirPut = putThisStreetByFid.get(fid) ?? 0;
        const toCallForThem = currentBet - theirPut;
        if (toCallForThem === 0) {
          await pokerDb.upsert("nl_holdem_pending_actions", [{ hand_id: handId, fid, street: currentStreet, action_type: "check" }]);
          return NextResponse.json<ApiResponse>({ ok: true, data: { handId, action: "check", pending: true } });
        }
      }
      return NextResponse.json<ApiResponse>({ ok: false, error: "Not your turn" }, { status: 400 });
    }

    const myPutThisStreet = putThisStreetByFid.get(fid) ?? 0;
    const toCall = currentBet - myPutThisStreet;
    const stacks = await pokerDb.fetch<{ fid: number; stack: number }>("nl_holdem_stacks", {
      filters: { game_id: gameId },
      limit: 20,
    });
    const myStack = (stacks ?? []).find((r) => Number(r.fid) === fid);
    const myStackNum = myStack ? Number(myStack.stack) : 0;

    let actionAmount = 0;
    if (action === "fold") {
      actionAmount = 0;
    } else if (action === "check") {
      if (toCall > 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Cannot check; must call or fold" }, { status: 400 });
      }
    } else if (action === "call") {
      actionAmount = Math.min(toCall, myStackNum);
    } else if (action === "bet") {
      if (currentBet > 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Cannot bet; must raise" }, { status: 400 });
      }
      if (amount < minRaise) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Bet must be at least min_raise" }, { status: 400 });
      }
      actionAmount = Math.min(amount, myStackNum);
    } else if (action === "raise") {
      const minTotalToRaise = currentBet + minRaise;
      const minAdditional = minTotalToRaise - myPutThisStreet;
      if (amount < minAdditional) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Raise must add at least ${minAdditional} to call and raise` }, { status: 400 });
      }
      actionAmount = Math.min(amount, myStackNum);
    }

    const nextSequence = maxSequence + 1;
    const actionType = action === "fold" ? "fold" : action === "check" ? "check" : action === "call" ? "call" : action === "bet" ? "bet" : "raise";
    await pokerDb.insert("nl_holdem_hand_actions", [
      {
        hand_id: handId,
        fid,
        action_type: actionType,
        amount: actionAmount,
        sequence: nextSequence,
        street: currentStreet,
      },
    ]);

    let newPot = pot;
    if (actionAmount > 0) {
      newPot = pot + actionAmount;
      await pokerDb.update("nl_holdem_stacks", { game_id: gameId, fid }, { stack: myStackNum - actionAmount });
    }
    let newCurrentBet = currentBet;
    let newMinRaise = minRaise;
    if (action === "bet" || action === "raise") {
      const totalPut = myPutThisStreet + actionAmount;
      newCurrentBet = totalPut;
      newMinRaise = totalPut - currentBet;
    }
    await pokerDb.update("nl_holdem_hands", { id: handId }, {
      pot: newPot,
      current_bet: newCurrentBet,
      min_raise: newMinRaise,
    });

    if (action === "fold") {
      foldedFids.add(fid);
      activeFids.delete(fid);
    } else {
      putThisStreetByFid.set(fid, (putThisStreetByFid.get(fid) ?? 0) + actionAmount);
    }

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
      return NextResponse.json<ApiResponse>({ ok: true, data: { handId, action: actionType } });
    }

    const putAfter = new Map(putThisStreetByFid);
    if (action !== "fold") putAfter.set(fid, (putAfter.get(fid) ?? 0) + actionAmount);
    const allMatched = activeRemaining.every((f) => (putAfter.get(f) ?? 0) >= newCurrentBet);
    const actedThisStreet = new Set<number>((actions ?? []).filter((a) => String(a.street) === currentStreet).map((a) => Number(a.fid)));
    actedThisStreet.add(fid);
    const everyoneActed = activeRemaining.every((f) => actedThisStreet.has(f));
    const canAdvance = allMatched && (newCurrentBet > 0 || everyoneActed);
    if (canAdvance) {
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
      // Auto-apply pending checks when next actor has one (same street, toCall=0)
      let loopMax = 20;
      while (loopMax-- > 0) {
        const nextActorFid = await getCurrentActor(handId);
        if (nextActorFid == null) break;
        const pendings = await pokerDb.fetch<{ fid: number; street: string; action_type: string }>("nl_holdem_pending_actions", {
          filters: { hand_id: handId, fid: nextActorFid },
          limit: 1,
        });
        const pending = pendings?.[0];
        if (!pending || pending.action_type !== "check" || String(pending.street) !== currentStreet) break;
        const handRow = (await pokerDb.fetch<HandRow>("nl_holdem_hands", { filters: { id: handId }, limit: 1 }))?.[0];
        if (!handRow) break;
        const hBet = Number(handRow.current_bet) || 0;
        const acts = await pokerDb.fetch<{ fid: number; action_type: string; amount: number; sequence: number; street: string }>(
          "nl_holdem_hand_actions",
          { filters: { hand_id: handId }, order: "sequence.asc", limit: 200 }
        );
        const putByFid = new Map<number, number>();
        for (const a of acts ?? []) {
          if (String(a.street) === currentStreet) putByFid.set(Number(a.fid), (putByFid.get(Number(a.fid)) ?? 0) + Number(a.amount));
        }
        const theirPut = putByFid.get(nextActorFid) ?? 0;
        const toCallForThem = hBet - theirPut;
        if (toCallForThem !== 0) break;
        const seq = (acts ?? []).reduce((m, a) => Math.max(m, Number(a.sequence)), 0) + 1;
        await pokerDb.insert("nl_holdem_hand_actions", [
          { hand_id: handId, fid: nextActorFid, action_type: "check", amount: 0, sequence: seq, street: currentStreet },
        ]);
        await pokerDb.delete("nl_holdem_pending_actions", { hand_id: handId, fid: nextActorFid });
        putByFid.set(nextActorFid, theirPut + 0);
        const folded = new Set<number>();
        for (const a of acts ?? []) if (a.action_type === "fold") folded.add(Number(a.fid));
        const hole = await pokerDb.fetch<{ fid: number }>("nl_holdem_hole_cards", { filters: { hand_id: handId }, limit: 10 });
        const active = new Set((hole ?? []).map((r) => Number(r.fid)));
        folded.forEach((f) => active.delete(f));
        const remaining = seatOrderFids.filter((f) => active.has(f) && !folded.has(f));
        const allM = remaining.every((f) => (putByFid.get(f) ?? 0) >= hBet);
        const acted = new Set((acts ?? []).filter((a) => String(a.street) === currentStreet).map((a) => Number(a.fid)));
        acted.add(nextActorFid);
        const everyoneA = remaining.every((f) => acted.has(f));
        const canAdv = allM && (hBet > 0 || everyoneA);
        if (canAdv) {
          if (currentStreet === "river") {
            await runShowdown(handId);
            const stacksAfter = await pokerDb.fetch<{ stack: number }>("nl_holdem_stacks", { filters: { game_id: gameId }, limit: 20 });
            const withChips = (stacksAfter ?? []).filter((r) => Number(r.stack) > 0).length;
            if (withChips >= 2) await dealHand(gameId);
          } else {
            await advanceStreet(handId);
          }
          return NextResponse.json<ApiResponse>({ ok: true, data: { handId, action: actionType } });
        }
      }
      await setActorEndsAt(handId);
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: { handId, action: actionType } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[nl-holdem/games/[id]/act POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to act" }, { status: 500 });
  }
}
