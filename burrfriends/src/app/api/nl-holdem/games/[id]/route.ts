/**
 * GET /api/nl-holdem/games/[id] - Game detail by ID (no is_preview filter; preview playable by URL)
 * Optional auth: when authenticated include unreadChatCount. Phase 40.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { getNeynarClient } from "~/lib/neynar";
import { pokerDb } from "~/lib/pokerDb";
import { getBlindLevelForGame } from "~/lib/nlHoldemPlay";
import type { ApiResponse } from "~/lib/types";

async function getUnreadChatCount(gameId: string, fid: number): Promise<number> {
  const presence = await pokerDb.fetch<{ chat_last_seen_at: string | null }>("nl_holdem_chat_presence", {
    filters: { game_id: gameId, fid },
    limit: 1,
  });
  const cutoff = presence?.[0]?.chat_last_seen_at ?? null;
  const cutoffMs = cutoff ? new Date(cutoff).getTime() : 0;
  const messages = await pokerDb.fetch<{ created_at: string }>("nl_holdem_chat_messages", {
    filters: { game_id: gameId },
    select: "created_at",
    limit: 500,
  });
  return (messages || []).filter((m) => new Date(m.created_at).getTime() > cutoffMs).length;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let fid: number | null = null;
    try {
      const auth = await requireAuth(req);
      fid = auth.fid;
    } catch {
      // unauthenticated; no unreadChatCount
    }

    const { id: gameId } = await params;
    const spectator = req.nextUrl.searchParams.get("spectator") === "1";
    const games = await pokerDb.fetch<Record<string, unknown>>("nl_holdem_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    const game = games[0] as Record<string, unknown>;
    const { game_password: _pw, ...rest } = game;
    const signups = await pokerDb.fetch<{ fid: number }>("nl_holdem_signups", {
      filters: { game_id: gameId },
      select: "fid",
      limit: 20,
    });
    const signupFids = (signups || []).map((r) => Number(r.fid));
    const payload: Record<string, unknown> = { ...rest, signupFids, hasPassword: Boolean(_pw && String(_pw).trim()) };
    if (fid != null) {
      payload.unreadChatCount = await getUnreadChatCount(gameId, fid);
    }
    const status = rest.status as string | undefined;
    const seatOrderFidsRaw = rest.seat_order_fids;
    const seatOrderFids = Array.isArray(seatOrderFidsRaw) ? seatOrderFidsRaw.map((f: unknown) => Number(f)).filter((f: number) => !isNaN(f) && f > 0) : [];
    if (status === "in_progress" && seatOrderFids.length > 0) {
      const blinds = getBlindLevelForGame(rest as Parameters<typeof getBlindLevelForGame>[0]);
      payload.blindsLevel = blinds.level;
      payload.smallBlind = blinds.smallBlind;
      payload.bigBlind = blinds.bigBlind;
      payload.nextBlindRaiseAt = blinds.nextBlindRaiseAt;
      const profiles: Record<number, { username: string; display_name: string; pfp_url: string }> = {};
      try {
        const client = getNeynarClient();
        for (let i = 0; i < seatOrderFids.length; i += 100) {
          const batch = seatOrderFids.slice(i, i + 100);
          const response = await client.fetchBulkUsers({ fids: batch });
          for (const user of response.users || []) {
            profiles[user.fid] = {
              username: user.username || `fid:${user.fid}`,
              display_name: user.display_name || user.username || `FID ${user.fid}`,
              pfp_url: user.pfp_url || "",
            };
          }
        }
      } catch {
        // optional
      }
      payload.seatOrderWithProfiles = seatOrderFids.map((fidNum, idx) => ({
        seat: idx + 1,
        fid: fidNum,
        username: profiles[fidNum]?.username ?? `fid:${fidNum}`,
        display_name: profiles[fidNum]?.display_name ?? `FID ${fidNum}`,
        pfp_url: profiles[fidNum]?.pfp_url ?? "",
      }));

      const hands = await pokerDb.fetch<{
        id: string;
        hand_number: number;
        pot: number;
        community_cards: unknown;
        current_street: string;
        current_bet: number;
        min_raise: number;
        status: string;
        dealer_seat_index: number;
        bb_seat_index: number;
        actor_ends_at: string | null;
      }>("nl_holdem_hands", {
        filters: { game_id: gameId },
        order: "created_at.desc",
        limit: 2,
      });
      const hand = hands?.[0];
      const lastCompleteHand = hands?.find((h) => h.status === "complete");
      if (hand && ["active", "showdown"].includes(hand.status)) {
        const N = seatOrderFids.length;
        const stacksRows = await pokerDb.fetch<{ fid: number; stack: number }>("nl_holdem_stacks", {
          filters: { game_id: gameId },
          limit: 20,
        });
        const stackByFid = new Map<number, number>();
        for (const r of stacksRows ?? []) {
          stackByFid.set(Number(r.fid), Number(r.stack));
        }
        const actions = await pokerDb.fetch<{ fid: number; action_type: string; amount: number; sequence: number; street: string }>(
          "nl_holdem_hand_actions",
          { filters: { hand_id: hand.id }, order: "sequence.asc", limit: 200 }
        );
        const holeRows = await pokerDb.fetch<{ fid: number; cards: unknown }>("nl_holdem_hole_cards", {
          filters: { hand_id: hand.id },
          limit: 10,
        });
        const activeFids = new Set((holeRows ?? []).map((r) => Number(r.fid)));
        const foldedFids = new Set<number>();
        const putThisStreetByFid = new Map<number, number>();
        for (const a of actions ?? []) {
          if (a.action_type === "fold") foldedFids.add(Number(a.fid));
          if (String(a.street) === hand.current_street) {
            const f = Number(a.fid);
            putThisStreetByFid.set(f, (putThisStreetByFid.get(f) ?? 0) + Number(a.amount));
          }
        }
        foldedFids.forEach((f) => activeFids.delete(f));
        const currentBet = Number(hand.current_bet) || 0;
        const dealerSeatIndex = Number(hand.dealer_seat_index) || 0;
        const bbSeatIndex = Number(hand.bb_seat_index) || 0;
        const firstToActSeat = hand.current_street === "preflop" ? (bbSeatIndex + 1) % N : (dealerSeatIndex + 1) % N;
        let actorFid: number | null = null;
        for (let i = 0; i < N; i++) {
          const seatIdx = (firstToActSeat + i) % N;
          const f = seatOrderFids[seatIdx];
          if (!activeFids.has(f)) continue;
          const putIn = putThisStreetByFid.get(f) ?? 0;
          if (putIn < currentBet) {
            actorFid = f;
            break;
          }
        }
        if (actorFid === null && activeFids.size > 0) {
          for (let i = 0; i < N; i++) {
            const seatIdx = (firstToActSeat + i) % N;
            const f = seatOrderFids[seatIdx];
            if (activeFids.has(f)) {
              actorFid = f;
              break;
            }
          }
        }
        const communityCards = Array.isArray(hand.community_cards) ? hand.community_cards : [];
        const holeCardsForRequester = !spectator && fid != null ? (holeRows ?? []).find((r) => Number(r.fid) === fid) : null;
        const holeCards = holeCardsForRequester && Array.isArray(holeCardsForRequester.cards) ? holeCardsForRequester.cards : [];
        const actionsList = (actions ?? []).map((a) => ({
          fid: Number(a.fid),
          actionType: a.action_type,
          amount: Number(a.amount),
          sequence: Number(a.sequence),
        }));
        const stacksList = seatOrderFids.map((fidNum, idx) => ({
          seatIndex: idx,
          fid: fidNum,
          stack: stackByFid.get(fidNum) ?? 0,
        }));
        const legalActions: string[] = [];
        let toCallForActor: number | undefined;
        let preActions: { fold: boolean; check: boolean } | undefined;
        let myPendingAction: string | null = null;
        if (fid != null && actorFid === fid) {
          legalActions.push("fold");
          const myPut = putThisStreetByFid.get(fid) ?? 0;
          const toCall = currentBet - myPut;
          toCallForActor = toCall;
          if (toCall === 0) legalActions.push("check");
          else legalActions.push("call");
          legalActions.push("bet", "raise");
        } else if (fid != null && activeFids.has(fid) && actorFid !== fid) {
          const myPut = putThisStreetByFid.get(fid) ?? 0;
          const toCallForMe = currentBet - myPut;
          preActions = { fold: true, check: toCallForMe === 0 };
          const pendings = await pokerDb.fetch<{ street: string; action_type: string }>("nl_holdem_pending_actions", {
            filters: { hand_id: hand.id, fid },
            limit: 1,
          });
          const p = pendings?.[0];
          if (p && String(p.street) === hand.current_street && p.action_type === "check") myPendingAction = "check";
        }
        const actorEndsAt =
          hand && typeof (hand as { actor_ends_at?: string | null }).actor_ends_at === "string"
            ? (hand as { actor_ends_at: string }).actor_ends_at
            : null;
        payload.currentHand = {
          handId: hand.id,
          handNumber: Number(hand.hand_number),
          pot: Number(hand.pot) || 0,
          communityCards,
          currentStreet: hand.current_street,
          currentBet,
          toCall: toCallForActor,
          minRaise: Number(hand.min_raise) || 0,
          status: hand.status,
          holeCards,
          stacks: stacksList,
          actions: actionsList,
          actorFid: actorFid ?? undefined,
          legalActions,
          dealerSeatIndex,
          bbSeatIndex,
          actorEndsAt,
          preActions,
          myPendingAction,
        };
      } else {
        payload.currentHand = null;
      }
      if (lastCompleteHand) {
        const revealedRows = await pokerDb.fetch<{ fid: number; cards: unknown }>("nl_holdem_hand_revealed_cards", {
          filters: { hand_id: lastCompleteHand.id },
          limit: 10,
        });
        const revealedCardsByFid: Record<number, string[]> = {};
        for (const r of revealedRows ?? []) {
          const cards = Array.isArray(r.cards) ? r.cards : [];
          if (cards.length === 2) revealedCardsByFid[Number(r.fid)] = cards;
        }
        payload.lastCompletedHand = {
          handId: lastCompleteHand.id,
          handNumber: Number(lastCompleteHand.hand_number),
          pot: Number(lastCompleteHand.pot) || 0,
          communityCards: Array.isArray(lastCompleteHand.community_cards) ? lastCompleteHand.community_cards : [],
          revealedCardsByFid,
        };
      } else {
        payload.lastCompletedHand = null;
      }
    }
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: payload,
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[nl-holdem/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
