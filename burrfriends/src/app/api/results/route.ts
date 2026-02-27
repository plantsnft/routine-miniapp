/**
 * GET /api/results - Unified game results across all game types
 * 
 * Query params:
 * - filter: 'all' | 'poker' | 'betr' (default: 'all')
 * - subfilter: game-specific filter (e.g., 'sit_and_go', 'tournament', 'betr_guesser', etc.)
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 * 
 * Returns results with "participated" flag for authenticated users.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import type { ApiResponse } from "~/lib/types";

interface ResultItem {
  id: string;
  gameType: 'poker' | 'betr_guesser' | 'buddy_up' | 'the_mole' | 'steal_no_steal' | 'jenga' | 'framedl_betr' | 'weekend_game' | 'superbowl_squares' | 'superbowl_props' | 'in_or_out' | 'take_from_the_pile' | 'bullied' | 'kill_or_keep' | 'art_contest' | 'nl_holdem' | 'ncaa_hoops';
  subType: string | null; // 'sit_and_go', 'tournament', etc.
  title: string;
  prizeAmount: number;
  settledAt: string;
  txHash: string | null;
  winners: Array<{
    fid: number;
    amount: number;
    position: number | null;
    username: string | null;
    display_name: string | null;
    pfp_url: string | null;
    /** Phase 39: ART CONTEST — display-only prize label */
    amount_display?: string | null;
  }>;
  participated: boolean;
  /** Phase 35: IN OR OUT — FIDs who chose Stay (for "Stayed" list on results card) */
  stayerFids?: number[];
  /** Phase 37: TAKE FROM THE PILE — events in order (pick/skip), remaining in pot */
  takeFromThePileEvents?: Array<{
    sequence: number;
    fid: number;
    event_type: string;
    amount_taken: number | null;
    username?: string | null;
    display_name?: string | null;
    pfp_url?: string | null;
  }>;
  takeFromThePileRemaining?: number;
  /** Phase 33: BULLIED — per-group outcome with hydrated profiles */
  bulliedGroups?: Array<{
    groupNumber: number;
    winnerFid: number | null;
    winnerUsername?: string | null;
    winnerDisplayName?: string | null;
    eliminatedProfiles?: Array<{ fid: number; username: string | null; display_name: string | null }>;
  }>;
  /** Phase 38: KILL OR KEEP — final 10 and eliminated FIDs (profiles hydrated later) */
  killOrKeepFinalFids?: number[];
  killOrKeepEliminatedFids?: number[];
  killOrKeepFinalProfiles?: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>;
  killOrKeepEliminatedProfiles?: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>;
  /** THE MOLE — when set, Results shows "Advanced" and "Eliminated" (profiles hydrated later) */
  theMoleAdvancedFids?: number[];
  theMoleEliminatedFids?: number[];
  theMoleAdvancedProfiles?: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>;
  theMoleEliminatedProfiles?: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>;
  /** One-off: STEAL OR NO STEAL result where winner is Jacy — show this eliminated profile under the winner */
  oneOffEliminatedProfile?: { fid: number; username: string | null; display_name: string | null; pfp_url: string | null };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'all';
    const subfilter = searchParams.get('subfilter') || null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Try to get authenticated user (optional - for participation check)
    let userFid: number | null = null;
    try {
      const auth = await requireAuth(req);
      userFid = auth.fid;
    } catch {
      // Not authenticated - that's ok, just won't show participation
    }

    const results: ResultItem[] = [];
    const allWinnerFids = new Set<number>();

    // Helper to fetch participation status
    const participationSets: Record<string, Set<number>> = {};

    // Fetch results based on filter
    const shouldFetchPoker = filter === 'all' || filter === 'poker';
    const shouldFetchBetr = filter === 'all' || filter === 'betr';

    // === POKER GAMES ===
    if (shouldFetchPoker) {
      const pokerFilters: Record<string, any> = { status: 'settled', community: 'betr' }; // Phase 36: user-facing only sees BETR
      
      // Apply subfilter for poker (sit_and_go vs tournament)
      if (filter === 'poker' && subfilter) {
        if (subfilter === 'sit_and_go') {
          pokerFilters.game_type = 'sit_and_go';
        } else if (subfilter === 'tournament') {
          pokerFilters.game_type = 'tournament';
        }
      }

      const pokerGames = await pokerDb.fetch<any>('burrfriends_games', {
        filters: pokerFilters,
        select: 'id,name,game_type,prize_amounts,settle_tx_hash,updated_at',
        order: 'updated_at.desc',
        limit: limit * 2, // Fetch more to account for filtering
      });

      // Get poker participants for these games
      if (pokerGames && pokerGames.length > 0) {
        const pokerGameIds = pokerGames.map((g: any) => g.id);
        const pokerParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
          select: 'game_id,fid,payout_amount,status',
          limit: 5000,
        });

        // Build participation set and winners
        const participantsByGame: Record<string, any[]> = {};
        for (const p of pokerParticipants || []) {
          if (pokerGameIds.includes(p.game_id)) {
            if (!participantsByGame[p.game_id]) participantsByGame[p.game_id] = [];
            participantsByGame[p.game_id].push(p);
            if (userFid && Number(p.fid) === userFid) {
              if (!participationSets['poker']) participationSets['poker'] = new Set();
              participationSets['poker'].add(p.game_id);
            }
          }
        }

        for (const game of pokerGames) {
          const participants = participantsByGame[game.id] || [];
          const winners = participants
            .filter((p: any) => p.status === 'settled' && p.payout_amount && Number(p.payout_amount) > 0)
            .map((p: any, idx: number) => {
              allWinnerFids.add(Number(p.fid));
              return {
                fid: Number(p.fid),
                amount: Number(p.payout_amount),
                position: idx + 1,
                username: null,
                display_name: null,
                pfp_url: null,
              };
            });

          results.push({
            id: game.id,
            gameType: 'poker',
            subType: game.game_type || 'sit_and_go',
            title: game.name || 'Poker Game',
            prizeAmount: Array.isArray(game.prize_amounts) 
              ? game.prize_amounts.reduce((a: number, b: number) => a + b, 0) 
              : 0,
            settledAt: game.updated_at,
            txHash: game.settle_tx_hash,
            winners,
            participated: participationSets['poker']?.has(game.id) || false,
          });
        }
      }
    }

    // === BETR GAMES ===
    if (shouldFetchBetr) {
      // Determine which BETR games to fetch based on subfilter
      const betrGameTypes = subfilter 
        ? [subfilter] 
        : ['betr_guesser', 'buddy_up', 'the_mole', 'steal_no_steal', 'jenga', 'framedl_betr', 'weekend_game', 'superbowl_squares', 'superbowl_props', 'in_or_out', 'take_from_the_pile', 'bullied', 'kill_or_keep', 'art_contest', 'nl_holdem', 'ncaa_hoops'];

      // BETR GUESSER
      if (betrGameTypes.includes('betr_guesser')) {
        const settlements = await pokerDb.fetch<any>('betr_guesser_settlements', {
          select: 'id,game_id,winner_fid,prize_amount,settled_at,tx_hash',
          order: 'settled_at.desc',
          limit: limit,
        });

        // Get games for titles
        const gameIds = [...new Set((settlements || []).map((s: any) => s.game_id))];
        const games = gameIds.length > 0 ? await pokerDb.fetch<any>('betr_guesser_games', {
          select: 'id,title,prize_amount',
          limit: 1000,
        }) : [];
        const gameMap = Object.fromEntries((games || []).map((g: any) => [g.id, g]));

        // Check participation if user is authed
        if (userFid) {
          const guesses = await pokerDb.fetch<any>('betr_guesser_guesses', {
            select: 'game_id,fid',
            limit: 5000,
          });
          for (const g of guesses || []) {
            if (Number(g.fid) === userFid) {
              if (!participationSets['betr_guesser']) participationSets['betr_guesser'] = new Set();
              participationSets['betr_guesser'].add(g.game_id);
            }
          }
        }

        for (const s of settlements || []) {
          allWinnerFids.add(Number(s.winner_fid));
          const game = gameMap[s.game_id];
          results.push({
            id: s.game_id,
            gameType: 'betr_guesser',
            subType: null,
            title: game?.title || 'BETR GUESSER',
            prizeAmount: Number(s.prize_amount),
            settledAt: s.settled_at,
            txHash: s.tx_hash,
            winners: [{
              fid: Number(s.winner_fid),
              amount: Number(s.prize_amount),
              position: 1,
              username: null,
              display_name: null,
              pfp_url: null,
            }],
            participated: participationSets['betr_guesser']?.has(s.game_id) || false,
          });
        }
      }

      // BUDDY UP
      if (betrGameTypes.includes('buddy_up')) {
        const games = await pokerDb.fetch<any>('buddy_up_games', {
          filters: { status: 'settled', community: 'betr' }, // Phase 36: user-facing only sees BETR
          select: 'id,title,prize_amount,settled_at,settle_tx_hash',
          order: 'settled_at.desc',
          limit: limit,
        });

        const gameIds = (games || []).map((g: any) => g.id);
        const settlements = gameIds.length > 0 ? await pokerDb.fetch<any>('buddy_up_settlements', {
          select: 'game_id,winner_fid,prize_amount,position',
          limit: 1000,
        }) : [];

        const settlementsByGame: Record<string, any[]> = {};
        for (const s of settlements || []) {
          if (!settlementsByGame[s.game_id]) settlementsByGame[s.game_id] = [];
          settlementsByGame[s.game_id].push(s);
          allWinnerFids.add(Number(s.winner_fid));
        }

        // Check participation
        if (userFid) {
          const signups = await pokerDb.fetch<any>('buddy_up_signups', {
            select: 'game_id,fid',
            limit: 5000,
          });
          for (const s of signups || []) {
            if (Number(s.fid) === userFid) {
              if (!participationSets['buddy_up']) participationSets['buddy_up'] = new Set();
              participationSets['buddy_up'].add(s.game_id);
            }
          }
        }

        for (const game of games || []) {
          const gameSettlements = settlementsByGame[game.id] || [];
          results.push({
            id: game.id,
            gameType: 'buddy_up',
            subType: null,
            title: game.title || 'BUDDY UP',
            prizeAmount: Number(game.prize_amount),
            settledAt: game.settled_at,
            txHash: game.settle_tx_hash,
            winners: gameSettlements.map((s: any) => ({
              fid: Number(s.winner_fid),
              amount: Number(s.prize_amount),
              position: s.position,
              username: null,
              display_name: null,
              pfp_url: null,
            })),
            participated: participationSets['buddy_up']?.has(game.id) || false,
          });
        }
      }

      // THE MOLE
      if (betrGameTypes.includes('the_mole')) {
        const games = await pokerDb.fetch<any>('mole_games', {
          filters: { status: 'settled', community: 'betr' }, // Phase 36: user-facing only sees BETR
          select: 'id,title,prize_amount,settled_at,settle_tx_hash,advanced_fids,eliminated_fids',
          order: 'settled_at.desc',
          limit: limit,
        });

        const gameIds = (games || []).map((g: any) => g.id);
        const settlements = gameIds.length > 0 ? await pokerDb.fetch<any>('mole_settlements', {
          select: 'game_id,winner_fid,prize_amount,position',
          limit: 1000,
        }) : [];

        const settlementsByGame: Record<string, any[]> = {};
        for (const s of settlements || []) {
          if (!settlementsByGame[s.game_id]) settlementsByGame[s.game_id] = [];
          settlementsByGame[s.game_id].push(s);
          allWinnerFids.add(Number(s.winner_fid));
        }

        // Signups: participation + derive eliminated when advanced_fids set but eliminated_fids null
        const signups = gameIds.length > 0 ? await pokerDb.fetch<any>('mole_signups', {
          select: 'game_id,fid',
          limit: 5000,
        }) : [];
        const signupFidsByGame: Record<string, number[]> = {};
        for (const s of signups || []) {
          const gid = s.game_id;
          if (!signupFidsByGame[gid]) signupFidsByGame[gid] = [];
          signupFidsByGame[gid].push(Number(s.fid));
          if (userFid && Number(s.fid) === userFid) {
            if (!participationSets['the_mole']) participationSets['the_mole'] = new Set();
            participationSets['the_mole'].add(gid);
          }
        }

        for (const game of games || []) {
          const gameSettlements = settlementsByGame[game.id] || [];
          const advancedFids: number[] = Array.isArray(game.advanced_fids)
            ? (game.advanced_fids as number[]).map((f: unknown) => Number(f)).filter((n: number) => !isNaN(n))
            : [];
          let eliminatedFids: number[] = Array.isArray(game.eliminated_fids)
            ? (game.eliminated_fids as number[]).map((f: unknown) => Number(f)).filter((n: number) => !isNaN(n))
            : [];
          if (eliminatedFids.length === 0 && advancedFids.length > 0 && signupFidsByGame[game.id]) {
            const signupSet = new Set(signupFidsByGame[game.id]);
            const advancedSet = new Set(advancedFids);
            eliminatedFids = signupFidsByGame[game.id].filter((f: number) => !advancedSet.has(f));
          }
          advancedFids.forEach((f) => allWinnerFids.add(f));
          eliminatedFids.forEach((f) => allWinnerFids.add(f));

          results.push({
            id: game.id,
            gameType: 'the_mole',
            subType: null,
            title: game.title || 'THE MOLE',
            prizeAmount: Number(game.prize_amount),
            settledAt: game.settled_at,
            txHash: game.settle_tx_hash,
            winners: gameSettlements.map((s: any) => ({
              fid: Number(s.winner_fid),
              amount: Number(s.prize_amount),
              position: s.position,
              username: null,
              display_name: null,
              pfp_url: null,
            })),
            participated: participationSets['the_mole']?.has(game.id) || false,
            theMoleAdvancedFids: advancedFids.length > 0 ? advancedFids : undefined,
            theMoleEliminatedFids: eliminatedFids.length > 0 ? eliminatedFids : undefined,
          });
        }
      }

      // STEAL OR NO STEAL (one-off: ensure FID 1477579 is hydrated for "Eliminated" under Jacy winner)
      if (betrGameTypes.includes('steal_no_steal')) {
        allWinnerFids.add(1477579);
        const games = await pokerDb.fetch<any>('steal_no_steal_games', {
          filters: { status: 'settled', community: 'betr' }, // Phase 36
          select: 'id,title,prize_amount,settled_at,settle_tx_hash',
          order: 'settled_at.desc',
          limit: limit,
        });

        const gameIds = (games || []).map((g: any) => g.id);
        const settlements = gameIds.length > 0 ? await pokerDb.fetch<any>('steal_no_steal_settlements', {
          select: 'game_id,winner_fid,prize_amount,position',
          limit: 1000,
        }) : [];

        const settlementsByGame: Record<string, any[]> = {};
        for (const s of settlements || []) {
          if (!settlementsByGame[s.game_id]) settlementsByGame[s.game_id] = [];
          settlementsByGame[s.game_id].push(s);
          allWinnerFids.add(Number(s.winner_fid));
        }

        // Check participation
        if (userFid) {
          const signups = await pokerDb.fetch<any>('steal_no_steal_signups', {
            select: 'game_id,fid',
            limit: 5000,
          });
          for (const s of signups || []) {
            if (Number(s.fid) === userFid) {
              if (!participationSets['steal_no_steal']) participationSets['steal_no_steal'] = new Set();
              participationSets['steal_no_steal'].add(s.game_id);
            }
          }
        }

        for (const game of games || []) {
          const gameSettlements = settlementsByGame[game.id] || [];
          results.push({
            id: game.id,
            gameType: 'steal_no_steal',
            subType: null,
            title: game.title || 'STEAL OR NO STEAL',
            prizeAmount: Number(game.prize_amount),
            settledAt: game.settled_at,
            txHash: game.settle_tx_hash,
            winners: gameSettlements.map((s: any) => ({
              fid: Number(s.winner_fid),
              amount: Number(s.prize_amount),
              position: s.position,
              username: null,
              display_name: null,
              pfp_url: null,
            })),
            participated: participationSets['steal_no_steal']?.has(game.id) || false,
          });
        }
      }

      // TAKE FROM THE PILE (Phase 37)
      if (betrGameTypes.includes('take_from_the_pile')) {
        const tfpGames = await pokerDb.fetch<any>('take_from_the_pile_games', {
          filters: { status: 'settled', community: 'betr' },
          select: 'id,title,prize_pool_amount,updated_at',
          order: 'updated_at.desc',
          limit: limit,
        });
        for (const game of tfpGames || []) {
          const events = await pokerDb.fetch<any>('take_from_the_pile_events', {
            filters: { game_id: game.id },
            select: 'sequence,fid,event_type,amount_taken',
            order: 'sequence.asc',
            limit: 5000,
          });
          const settlements = await pokerDb.fetch<any>('take_from_the_pile_settlements', {
            filters: { game_id: game.id },
            select: 'fid,amount',
            limit: 1000,
          });
          const eventsList = (events || []).sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));
          const totalTaken = eventsList
            .filter((e: any) => e.event_type === 'pick' && e.amount_taken != null)
            .reduce((sum: number, e: any) => sum + (Number(e.amount_taken) || 0), 0);
          const remaining = Math.max(0, (Number(game.prize_pool_amount) || 0) - totalTaken);
          for (const e of eventsList) allWinnerFids.add(Number(e.fid));
          for (const s of settlements || []) {
            allWinnerFids.add(Number(s.fid));
          }
          let participated = false;
          if (userFid) {
            const picks = await pokerDb.fetch<any>('take_from_the_pile_picks', {
              filters: { game_id: game.id, fid: userFid },
              limit: 1,
            });
            participated = (picks || []).length > 0;
            if (participated) {
              if (!participationSets['take_from_the_pile']) participationSets['take_from_the_pile'] = new Set();
              participationSets['take_from_the_pile'].add(game.id);
            }
          }
          results.push({
            id: game.id,
            gameType: 'take_from_the_pile',
            subType: null,
            title: game.title || 'TAKE FROM THE PILE',
            prizeAmount: Number(game.prize_pool_amount) || 0,
            settledAt: game.updated_at,
            txHash: null,
            winners: (settlements || []).map((s: any, idx: number) => ({
              fid: Number(s.fid),
              amount: Number(s.amount),
              position: idx + 1,
              username: null,
              display_name: null,
              pfp_url: null,
            })),
            participated: participationSets['take_from_the_pile']?.has(game.id) || false,
            takeFromThePileEvents: eventsList.map((e: any) => ({
              sequence: Number(e.sequence),
              fid: Number(e.fid),
              event_type: e.event_type || 'pick',
              amount_taken: e.amount_taken != null ? Number(e.amount_taken) : null,
            })),
            takeFromThePileRemaining: remaining,
          });
        }
      }

      // IN OR OUT (Phase 35)
      const AMOUNT_POOL = 10_000_000;
      if (betrGameTypes.includes('in_or_out')) {
        const games = await pokerDb.fetch<any>('in_or_out_games', {
          filters: { status: 'settled', community: 'betr' }, // Phase 36
          select: 'id,title,updated_at',
          order: 'updated_at.desc',
          limit: limit,
        });
        for (const game of games || []) {
          const choices = await pokerDb.fetch<{ fid: number; choice: string }>('in_or_out_choices', {
            filters: { game_id: game.id },
            limit: 5000,
          });
          const list = choices || [];
          const quitterCount = list.filter((c) => c.choice === 'quit').length;
          const amountPerQuitter = quitterCount > 0 ? Math.floor(AMOUNT_POOL / quitterCount) : 0;
          const quitters = list.filter((c) => c.choice === 'quit').map((c) => Number(c.fid));
          const stayers = list.filter((c) => c.choice === 'stay').map((c) => Number(c.fid));
          for (const fid of quitters) allWinnerFids.add(fid);
          if (userFid && list.some((c) => Number(c.fid) === userFid)) {
            if (!participationSets['in_or_out']) participationSets['in_or_out'] = new Set();
            participationSets['in_or_out'].add(game.id);
          }
          results.push({
            id: game.id,
            gameType: 'in_or_out',
            subType: null,
            title: game.title || 'IN OR OUT',
            prizeAmount: AMOUNT_POOL,
            settledAt: game.updated_at,
            txHash: null,
            winners: quitters.map((fid, idx) => ({
              fid,
              amount: amountPerQuitter,
              position: idx + 1,
              username: null,
              display_name: null,
              pfp_url: null,
            })),
            participated: participationSets['in_or_out']?.has(game.id) || false,
            stayerFids: stayers,
          });
        }
      }

      // KILL OR KEEP (Phase 38)
      if (betrGameTypes.includes('kill_or_keep')) {
        const kokGames = await pokerDb.fetch<any>('kill_or_keep_games', {
          filters: { status: 'settled', community: 'betr' },
          select: 'id,title,updated_at,turn_order_fids,remaining_fids,eliminated_fids',
          order: 'updated_at.desc',
          limit: limit,
        });
        for (const game of kokGames || []) {
          const remaining = (game.remaining_fids || []).map((f: unknown) => Number(f)).filter(Number.isFinite);
          const eliminated = (game.eliminated_fids || []).map((f: unknown) => Number(f)).filter(Number.isFinite);
          const order = (game.turn_order_fids || []).map((f: unknown) => Number(f)).filter(Number.isFinite);
          const participantFids = new Set([...order, ...remaining, ...eliminated]);
          let participated = false;
          if (userFid && participantFids.has(userFid)) {
            if (!participationSets['kill_or_keep']) participationSets['kill_or_keep'] = new Set();
            participationSets['kill_or_keep'].add(game.id);
            participated = true;
          }
          for (const f of remaining) allWinnerFids.add(f);
          for (const f of eliminated) allWinnerFids.add(f);
          results.push({
            id: game.id,
            gameType: 'kill_or_keep',
            subType: null,
            title: game.title || 'KILL OR KEEP',
            prizeAmount: 0,
            settledAt: game.updated_at,
            txHash: null,
            winners: [],
            participated: participationSets['kill_or_keep']?.has(game.id) || false,
            killOrKeepFinalFids: remaining,
            killOrKeepEliminatedFids: eliminated,
          });
        }
      }

      // BULLIED (Phase 33)
      if (betrGameTypes.includes('bullied')) {
        const bulliedGames = await pokerDb.fetch<any>('bullied_games', {
          filters: { status: 'settled', community: 'betr' },
          select: 'id,title,updated_at',
          order: 'updated_at.desc',
          limit: limit,
        });
        for (const game of bulliedGames || []) {
          // Each BULLIED game has exactly one round
          const rounds = await pokerDb.fetch<any>('bullied_rounds', {
            filters: { game_id: game.id },
            select: 'id',
            limit: 1,
          });
          const round = (rounds || [])[0];
          if (!round) continue;

          const groups = await pokerDb.fetch<any>('bullied_groups', {
            filters: { round_id: round.id },
            select: 'group_number,fids,winner_fid',
            order: 'group_number.asc',
            limit: 500,
          });

          const bulliedGroups: ResultItem['bulliedGroups'] = [];
          for (const group of groups || []) {
            const winnerFid = group.winner_fid ? Number(group.winner_fid) : null;
            const allFids: number[] = (group.fids || []).map(Number);
            const eliminatedFids = allFids.filter((f) => f !== winnerFid);

            if (winnerFid) allWinnerFids.add(winnerFid);
            for (const f of eliminatedFids) allWinnerFids.add(f);

            bulliedGroups.push({
              groupNumber: Number(group.group_number),
              winnerFid,
              winnerUsername: null,
              winnerDisplayName: null,
              eliminatedProfiles: eliminatedFids.map((f) => ({ fid: f, username: null, display_name: null })),
            });
          }

          const allParticipantFids = (groups || []).flatMap((g: any) => (g.fids || []).map(Number));
          if (userFid && allParticipantFids.includes(userFid)) {
            if (!participationSets['bullied']) participationSets['bullied'] = new Set();
            participationSets['bullied'].add(game.id);
          }

          results.push({
            id: game.id,
            gameType: 'bullied',
            subType: null,
            title: game.title || 'BULLIED',
            prizeAmount: 0,
            settledAt: game.updated_at,
            txHash: null,
            winners: [],
            participated: participationSets['bullied']?.has(game.id) || false,
            bulliedGroups,
          });
        }
      }

      // JENGA
      if (betrGameTypes.includes('jenga')) {
        const settlements = await pokerDb.fetch<any>('jenga_settlements', {
          select: 'id,game_id,winner_fid,prize_amount,settled_at,tx_hash',
          order: 'settled_at.desc',
          limit: limit,
        });

        const gameIds = [...new Set((settlements || []).map((s: any) => s.game_id))];
        const games = gameIds.length > 0 ? await pokerDb.fetch<any>('jenga_games', {
          filters: { community: 'betr' }, // Phase 36: user-facing only sees BETR
          select: 'id,title,prize_amount',
          limit: 1000,
        }) : [];
        const gameMap = Object.fromEntries((games || []).map((g: any) => [g.id, g]));

        // Check participation
        if (userFid) {
          const signups = await pokerDb.fetch<any>('jenga_signups', {
            select: 'game_id,fid',
            limit: 5000,
          });
          for (const s of signups || []) {
            if (Number(s.fid) === userFid) {
              if (!participationSets['jenga']) participationSets['jenga'] = new Set();
              participationSets['jenga'].add(s.game_id);
            }
          }
        }

        for (const s of settlements || []) {
          allWinnerFids.add(Number(s.winner_fid));
          const game = gameMap[s.game_id];
          results.push({
            id: s.game_id,
            gameType: 'jenga',
            subType: null,
            title: game?.title || 'JENGA',
            prizeAmount: Number(s.prize_amount),
            settledAt: s.settled_at,
            txHash: s.tx_hash,
            winners: [{
              fid: Number(s.winner_fid),
              amount: Number(s.prize_amount),
              position: 1,
              username: null,
              display_name: null,
              pfp_url: null,
            }],
            participated: participationSets['jenga']?.has(s.game_id) || false,
          });
        }
      }

      // FRAMEDL BETR (remix_betr)
      if (betrGameTypes.includes('framedl_betr')) {
        const settlements = await pokerDb.fetch<any>('remix_betr_settlements', {
          select: 'id,round_label,winner_fid,amount,position,chosen_at,tx_hash',
          order: 'chosen_at.desc',
          limit: limit * 20, // Multiple winners per round (e.g. 7+ for FRAMEDL advantage-only)
        });

        // Group by round_label (since there's no game_id, use round_label as ID)
        const settlementsByRound: Record<string, any[]> = {};
        for (const s of settlements || []) {
          const roundId = s.round_label || 'default';
          if (!settlementsByRound[roundId]) settlementsByRound[roundId] = [];
          settlementsByRound[roundId].push(s);
          allWinnerFids.add(Number(s.winner_fid));
        }

        // Check participation (any submission = participated)
        let framedlParticipated = false;
        if (userFid) {
          const scores = await pokerDb.fetch<any>('remix_betr_scores', {
            select: 'fid',
            limit: 10000,
          });
          framedlParticipated = (scores || []).some((s: any) => Number(s.fid) === userFid);
        }

        for (const [roundLabel, roundSettlements] of Object.entries(settlementsByRound)) {
          const firstSettlement = roundSettlements[0];
          const totalPrize = roundSettlements.reduce((sum: number, s: any) => sum + Number(s.amount), 0);
          
          results.push({
            id: roundLabel,
            gameType: 'framedl_betr',
            subType: null,
            title: `FRAMEDL BETR - ${roundLabel}`,
            prizeAmount: totalPrize,
            settledAt: firstSettlement.chosen_at,
            txHash: firstSettlement.tx_hash,
            winners: roundSettlements.map((s: any) => ({
              fid: Number(s.winner_fid),
              amount: Number(s.amount),
              position: s.position,
              username: null,
              display_name: null,
              pfp_url: null,
            })),
            participated: framedlParticipated,
          });
        }
      }

      // WEEKEND GAME (3D Racer) – settled rounds, 5 winners per round; result.id = round.id for picks
      if (betrGameTypes.includes('weekend_game')) {
        const rounds = await pokerDb.fetch<any>('weekend_game_rounds', {
          filters: { status: 'settled', community: 'betr' }, // Phase 36
          select: 'id,round_label,settled_at',
          order: 'settled_at.desc',
          limit: limit,
        });
        if (rounds && rounds.length > 0) {
          const settlements = await pokerDb.fetch<any>('weekend_game_settlements', {
            select: 'round_label,winner_fid,amount,position,chosen_at,tx_hash',
            limit: 500,
          });
          const byRoundLabel: Record<string, any[]> = {};
          for (const s of settlements || []) {
            const key = s.round_label ?? '';
            if (!byRoundLabel[key]) byRoundLabel[key] = [];
            byRoundLabel[key].push(s);
            allWinnerFids.add(Number(s.winner_fid));
          }
          for (const round of rounds) {
            const roundLabel = round.round_label ?? '';
            const roundSettlements = (byRoundLabel[roundLabel] || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
            const firstS = roundSettlements[0];
            results.push({
              id: round.id,
              gameType: 'weekend_game',
              subType: null,
              title: roundLabel ? `WEEKEND GAME - ${roundLabel}` : 'WEEKEND GAME',
              prizeAmount: 0,
              settledAt: firstS?.chosen_at ?? round.settled_at ?? '',
              txHash: firstS?.tx_hash ?? null,
              winners: roundSettlements.map((s: any) => ({
                fid: Number(s.winner_fid),
                amount: Number(s.amount),
                position: s.position ?? null,
                username: null,
                display_name: null,
                pfp_url: null,
              })),
              participated: userFid != null && roundSettlements.some((s: any) => Number(s.winner_fid) === userFid),
            });
          }
        }
      }

      // SUPERBOWL SQUARES
      if (betrGameTypes.includes('superbowl_squares')) {
        const games = await pokerDb.fetch<any>('superbowl_squares_games', {
          filters: { status: 'settled' },
          select: 'id,title,total_prize_pool,settled_at,settle_tx_hash',
          order: 'settled_at.desc',
          limit: limit,
        });

        const gameIds = (games || []).map((g: any) => g.id);
        const settlements = gameIds.length > 0 ? await pokerDb.fetch<any>('superbowl_squares_settlements', {
          select: 'game_id,winner_fid,prize_amount,quarter',
          limit: 1000,
        }) : [];

        const settlementsByGame: Record<string, any[]> = {};
        for (const s of settlements || []) {
          if (!settlementsByGame[s.game_id]) settlementsByGame[s.game_id] = [];
          settlementsByGame[s.game_id].push(s);
          allWinnerFids.add(Number(s.winner_fid));
        }

        // Check participation
        if (userFid) {
          const claims = await pokerDb.fetch<any>('superbowl_squares_claims', {
            select: 'game_id,fid',
            limit: 5000,
          });
          for (const c of claims || []) {
            if (Number(c.fid) === userFid) {
              if (!participationSets['superbowl_squares']) participationSets['superbowl_squares'] = new Set();
              participationSets['superbowl_squares'].add(c.game_id);
            }
          }
        }

        for (const game of games || []) {
          const gameSettlements = settlementsByGame[game.id] || [];
          // Map quarter to position: q1=1, halftime=2, q3=3, final=4
          const quarterOrder: Record<string, number> = { q1: 1, halftime: 2, q3: 3, final: 4 };
          results.push({
            id: game.id,
            gameType: 'superbowl_squares',
            subType: null,
            title: game.title || 'BETR SUPERBOWL SQUARES',
            prizeAmount: Number(game.total_prize_pool),
            settledAt: game.settled_at,
            txHash: game.settle_tx_hash,
            winners: gameSettlements
              .sort((a: any, b: any) => (quarterOrder[a.quarter] || 0) - (quarterOrder[b.quarter] || 0))
              .map((s: any) => ({
                fid: Number(s.winner_fid),
                amount: Number(s.prize_amount),
                position: quarterOrder[s.quarter] || null,
                username: null,
                display_name: null,
                pfp_url: null,
              })),
            participated: participationSets['superbowl_squares']?.has(game.id) || false,
          });
        }
      }

      // SUPERBOWL PROPS
      if (betrGameTypes.includes('superbowl_props')) {
        const games = await pokerDb.fetch<any>('superbowl_props_games', {
          filters: { status: 'settled' },
          select: 'id,title,total_prize_pool,settled_at,settle_tx_hash',
          order: 'settled_at.desc',
          limit: limit,
        });

        const gameIds = (games || []).map((g: any) => g.id);
        const settlements = gameIds.length > 0 ? await pokerDb.fetch<any>('superbowl_props_settlements', {
          select: 'game_id,winner_fid,prize_amount,rank',
          limit: 1000,
        }) : [];

        const settlementsByGame: Record<string, any[]> = {};
        for (const s of settlements || []) {
          if (!settlementsByGame[s.game_id]) settlementsByGame[s.game_id] = [];
          settlementsByGame[s.game_id].push(s);
          allWinnerFids.add(Number(s.winner_fid));
        }

        // Check participation
        if (userFid) {
          const subs = await pokerDb.fetch<any>('superbowl_props_submissions', {
            select: 'game_id,fid',
            limit: 5000,
          });
          for (const s of subs || []) {
            if (Number(s.fid) === userFid) {
              if (!participationSets['superbowl_props']) participationSets['superbowl_props'] = new Set();
              participationSets['superbowl_props'].add(s.game_id);
            }
          }
        }

        for (const game of games || []) {
          const gameSettlements = settlementsByGame[game.id] || [];
          results.push({
            id: game.id,
            gameType: 'superbowl_props',
            subType: null,
            title: game.title || 'SUPERBOWL PROPS',
            prizeAmount: Number(game.total_prize_pool),
            settledAt: game.settled_at,
            txHash: game.settle_tx_hash,
            winners: gameSettlements
              .sort((a: any, b: any) => (a.rank || 0) - (b.rank || 0))
              .map((s: any) => ({
                fid: Number(s.winner_fid),
                amount: Number(s.prize_amount),
                position: s.rank || null,
                username: null,
                display_name: null,
                pfp_url: null,
              })),
            participated: participationSets['superbowl_props']?.has(game.id) || false,
          });
        }
      }

      // ART CONTEST (Phase 39)
      // NL HOLDEM (Phase 40) — settled games; winners/payouts TBD when play tables exist
      if (betrGameTypes.includes('nl_holdem')) {
        const nlHoldemGames = await pokerDb.fetch<any>('nl_holdem_games', {
          filters: { status: 'settled', community: 'betr' },
          select: 'id,title,updated_at,prize_amounts',
          order: 'updated_at.desc',
          limit: limit,
        });
        for (const game of nlHoldemGames || []) {
          const signups = await pokerDb.fetch<any>('nl_holdem_signups', {
            filters: { game_id: game.id },
            select: 'fid',
            limit: 20,
          });
          const participantFids = new Set((signups || []).map((s: any) => Number(s.fid)));
          let participated = false;
          if (userFid && participantFids.has(userFid)) {
            if (!participationSets['nl_holdem']) participationSets['nl_holdem'] = new Set();
            participationSets['nl_holdem'].add(game.id);
            participated = true;
          }
          const prizeAmount = Array.isArray(game.prize_amounts)
            ? game.prize_amounts.reduce((sum: number, amt: number) => sum + (Number(amt) || 0), 0)
            : 0;
          results.push({
            id: game.id,
            gameType: 'nl_holdem',
            subType: null,
            title: game.title || 'NL HOLDEM',
            prizeAmount,
            settledAt: game.updated_at,
            txHash: null,
            winners: [],
            participated: participationSets['nl_holdem']?.has(game.id) || false,
          });
        }
      }

      if (betrGameTypes.includes('art_contest')) {
        const contests = await pokerDb.fetch<any>('art_contest', {
          filters: { status: 'settled' },
          select: 'id,title,settled_at',
          order: 'settled_at.desc',
          limit: limit,
        });
        for (const c of contests || []) {
          const winnerRows = await pokerDb.fetch<any>('art_contest_winners', {
            filters: { contest_id: c.id },
            select: 'fid,position,amount_display',
            order: 'position.asc',
            limit: 20,
          });
          const submissions = await pokerDb.fetch<any>('art_contest_submissions', {
            filters: { contest_id: c.id },
            select: 'fid',
            limit: 5000,
          });
          const participantFids = new Set((submissions || []).map((s: any) => Number(s.fid)));
          if (userFid && participantFids.has(userFid)) {
            if (!participationSets['art_contest']) participationSets['art_contest'] = new Set();
            participationSets['art_contest'].add(c.id);
          }
          for (const w of winnerRows || []) allWinnerFids.add(Number(w.fid));
          results.push({
            id: c.id,
            gameType: 'art_contest',
            subType: null,
            title: c.title || 'TO SPINFINITY AND BEYOND ART CONTEST',
            prizeAmount: 0,
            settledAt: c.settled_at,
            txHash: null,
            winners: (winnerRows || []).map((w: any) => ({
              fid: Number(w.fid),
              amount: 0,
              position: w.position ?? null,
              username: null,
              display_name: null,
              pfp_url: null,
              amount_display: w.amount_display ?? null,
            })),
            participated: participationSets['art_contest']?.has(c.id) || false,
          });
        }
      }

      if (betrGameTypes.includes('ncaa_hoops')) {
        const contests = await pokerDb.fetch<any>('ncaa_hoops_contests', {
          filters: { status: 'settled' },
          select: 'id,title,updated_at',
          order: 'updated_at.desc',
          limit: limit,
        });
        for (const c of contests || []) {
          const settlementRows = await pokerDb.fetch<any>('ncaa_hoops_settlements', {
            filters: { contest_id: c.id },
            select: 'fid,position,total_score',
            order: 'position.asc',
            limit: 100,
          });
          const bracketRows = await pokerDb.fetch<any>('ncaa_hoops_brackets', {
            filters: { contest_id: c.id },
            select: 'fid',
            limit: 5000,
          });
          const participantFids = new Set((bracketRows || []).map((b: any) => Number(b.fid)));
          if (userFid && participantFids.has(userFid)) {
            if (!participationSets['ncaa_hoops']) participationSets['ncaa_hoops'] = new Set();
            participationSets['ncaa_hoops'].add(c.id);
          }
          for (const s of settlementRows || []) allWinnerFids.add(Number(s.fid));
          results.push({
            id: c.id,
            gameType: 'ncaa_hoops',
            subType: null,
            title: c.title || 'NCAA HOOPS',
            prizeAmount: 0,
            settledAt: c.updated_at,
            txHash: null,
            winners: (settlementRows || []).map((s: any) => ({
              fid: Number(s.fid),
              amount: Number(s.total_score) || 0,
              position: s.position ?? null,
              username: null,
              display_name: null,
              pfp_url: null,
            })),
            participated: participationSets['ncaa_hoops']?.has(c.id) || false,
          });
        }
      }
    }

    // Sort all results by settledAt descending
    results.sort((a, b) => new Date(b.settledAt).getTime() - new Date(a.settledAt).getTime());

    // Phase 28.1: Determine available BETR game types (only types with results)
    const availableBetrTypes = [...new Set(
      results
        .filter(r => r.gameType !== 'poker')
        .map(r => r.gameType)
    )];

    // Apply pagination
    const paginatedResults = results.slice(offset, offset + limit);
    const hasMore = results.length > offset + limit;

    // Hydrate winner profiles
    const userMap: Record<number, CachedProfileData> = {};
    if (allWinnerFids.size > 0) {
      const fidsArray = Array.from(allWinnerFids);
      const { cached, needFetch } = getProfilesFromCache(fidsArray);
      Object.assign(userMap, cached);

      if (needFetch.length > 0) {
        try {
          const client = getNeynarClient();
          const { users } = await client.fetchBulkUsers({ fids: needFetch });
          const fetched: Record<number, CachedProfileData> = {};
          for (const u of users || []) {
            const id = (u as any).fid;
            if (id != null) {
              const profile: CachedProfileData = {
                username: (u as any).username,
                display_name: (u as any).display_name,
                pfp_url: (u as any).pfp_url || (u as any).pfp?.url,
              };
              userMap[id] = profile;
              fetched[id] = profile;
            }
          }
          setProfilesInCache(fetched);
        } catch (e) {
          console.warn('[results] fetchBulkUsers failed:', e);
        }
      }
    }

    // Apply profiles to winners and to TAKE FROM THE PILE events
    for (const result of paginatedResults) {
      for (const winner of result.winners) {
        const profile = userMap[winner.fid];
        if (profile) {
          winner.username = profile.username || null;
          winner.display_name = profile.display_name || null;
          winner.pfp_url = profile.pfp_url || null;
        }
      }
      if (result.gameType === 'take_from_the_pile' && result.takeFromThePileEvents) {
        for (const ev of result.takeFromThePileEvents) {
          const profile = userMap[ev.fid];
          if (profile) {
            ev.username = profile.username || null;
            ev.display_name = profile.display_name || null;
            ev.pfp_url = profile.pfp_url || null;
          }
        }
      }
      if (result.gameType === 'bullied' && result.bulliedGroups) {
        for (const group of result.bulliedGroups) {
          if (group.winnerFid) {
            const p = userMap[group.winnerFid];
            group.winnerUsername = p?.username || null;
            group.winnerDisplayName = p?.display_name || null;
          }
          if (group.eliminatedProfiles) {
            group.eliminatedProfiles = group.eliminatedProfiles.map((ep) => {
              const p = userMap[ep.fid];
              return { fid: ep.fid, username: p?.username || null, display_name: p?.display_name || null };
            });
          }
        }
      }
      if (result.gameType === 'kill_or_keep') {
        if (result.killOrKeepFinalFids?.length) {
          result.killOrKeepFinalProfiles = result.killOrKeepFinalFids.map((fid) => {
            const p = userMap[fid];
            return { fid, username: p?.username ?? null, display_name: p?.display_name ?? null, pfp_url: p?.pfp_url ?? null };
          });
        }
        if (result.killOrKeepEliminatedFids?.length) {
          result.killOrKeepEliminatedProfiles = result.killOrKeepEliminatedFids.map((fid) => {
            const p = userMap[fid];
            return { fid, username: p?.username ?? null, display_name: p?.display_name ?? null, pfp_url: p?.pfp_url ?? null };
          });
        }
      }
      if (result.gameType === 'the_mole') {
        if (result.theMoleAdvancedFids?.length) {
          result.theMoleAdvancedProfiles = result.theMoleAdvancedFids.map((fid) => {
            const p = userMap[fid];
            return { fid, username: p?.username ?? null, display_name: p?.display_name ?? null, pfp_url: p?.pfp_url ?? null };
          });
        }
        if (result.theMoleEliminatedFids?.length) {
          result.theMoleEliminatedProfiles = result.theMoleEliminatedFids.map((fid) => {
            const p = userMap[fid];
            return { fid, username: p?.username ?? null, display_name: p?.display_name ?? null, pfp_url: p?.pfp_url ?? null };
          });
        }
      }
      // One-off: STEAL OR NO STEAL result where winner is Jacy — attach eliminated profile (FID 1477579) for display under winner
      if (result.gameType === 'steal_no_steal' && result.winners.length > 0) {
        const first = result.winners[0];
        const name = ((first.display_name || first.username) ?? '').trim().toLowerCase();
        if (name === 'jacy') {
          const p = userMap[1477579];
          (result as ResultItem).oneOffEliminatedProfile = {
            fid: 1477579,
            username: p?.username ?? null,
            display_name: p?.display_name ?? null,
            pfp_url: p?.pfp_url ?? null,
          };
        }
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        results: paginatedResults,
        hasMore,
        total: results.length,
        availableBetrTypes,
      },
    });
  } catch (e: unknown) {
    console.error('[results GET]', e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: (e as Error)?.message || 'Failed to fetch results' },
      { status: 500 }
    );
  }
}
