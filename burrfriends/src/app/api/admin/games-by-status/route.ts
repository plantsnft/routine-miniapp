/**
 * GET /api/admin/games-by-status
 * Returns list of games for a given status
 * 
 * Query params:
 * - status: 'signupsOpen' | 'inProgress' | 'needsAction' | 'scheduled'
 * 
 * Phase 18.3: Admin Dashboard v4
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

interface GameItem {
  type: string;
  id: string;
  title: string;
  link: string;
  created_at: string;
  is_preview?: boolean;
}

const VALID_STATUSES = ['signupsOpen', 'inProgress', 'needsAction', 'scheduled'] as const;
type StatusType = typeof VALID_STATUSES[number];

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status') as StatusType;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Invalid status. Must be one of: signupsOpen, inProgress, needsAction, scheduled" },
        { status: 400 }
      );
    }

    const games: GameItem[] = [];

    if (status === 'signupsOpen') {
      // BETR GUESSER - status = 'open'
      const betrGuesserGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("betr_guesser_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "open" },
      });
      for (const g of betrGuesserGames || []) {
        games.push({
          type: "betr_guesser",
          id: g.id,
          title: g.title || "BETR GUESSER",
          link: `/betr-guesser?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // BUDDY UP - status = 'signup'
      const buddyUpGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("buddy_up_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "signup" },
      });
      for (const g of buddyUpGames || []) {
        games.push({
          type: "buddy_up",
          id: g.id,
          title: g.title || "BUDDY UP",
          link: `/buddy-up?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // THE MOLE - status = 'signup'
      const moleGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("mole_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "signup" },
      });
      for (const g of moleGames || []) {
        games.push({
          type: "the_mole",
          id: g.id,
          title: g.title || "THE MOLE",
          link: `/the-mole?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // STEAL OR NO STEAL - status = 'signup'
      const stealNoStealGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("steal_no_steal_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "signup" },
      });
      for (const g of stealNoStealGames || []) {
        const isHeadsUp = g.title === "HEADS UP Steal or No Steal";
        games.push({
          type: "steal_no_steal",
          id: g.id,
          title: g.title || "STEAL OR NO STEAL",
          link: isHeadsUp ? `/heads-up-steal-no-steal?gameId=${g.id}` : `/steal-no-steal?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // JENGA - status = 'signup'
      const jengaGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("jenga_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "signup" },
      });
      for (const g of jengaGames || []) {
        games.push({
          type: "jenga",
          id: g.id,
          title: g.title || "JENGA",
          link: `/jenga?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // BULLIED - status = 'open'
      const bulliedGamesOpen = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("bullied_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "open" },
      });
      for (const g of bulliedGamesOpen || []) {
        games.push({
          type: "bullied",
          id: g.id,
          title: g.title || "BULLIED",
          link: `/bullied?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // IN OR OUT - status = 'open'
      const inOrOutGamesOpen = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("in_or_out_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "open" },
      });
      for (const g of inOrOutGamesOpen || []) {
        games.push({
          type: "in_or_out",
          id: g.id,
          title: g.title || "IN OR OUT",
          link: `/in-or-out?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // TAKE FROM THE PILE - status = 'open'
      const takeFromThePileGamesOpen = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("take_from_the_pile_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "open" },
      });
      for (const g of takeFromThePileGamesOpen || []) {
        games.push({
          type: "take_from_the_pile",
          id: g.id,
          title: g.title || "TAKE FROM THE PILE",
          link: `/take-from-the-pile?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // KILL OR KEEP - status = 'open'
      const killOrKeepGamesOpen = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("kill_or_keep_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "open" },
      });
      for (const g of killOrKeepGamesOpen || []) {
        games.push({
          type: "kill_or_keep",
          id: g.id,
          title: g.title || "KILL OR KEEP",
          link: `/kill-or-keep?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // NL HOLDEM - status = 'open'
      const nlHoldemGamesOpen = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("nl_holdem_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "open" },
      });
      for (const g of nlHoldemGamesOpen || []) {
        games.push({
          type: "nl_holdem",
          id: g.id,
          title: g.title || "NL HOLDEM",
          link: `/nl-holdem?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // REMIX BETR - status = 'open'
      const remixRounds = await pokerDb.fetch<{
        id: string;
        round_label: string;
        created_at: string;
        is_preview?: boolean;
      }>("remix_betr_rounds", {
        select: "id,round_label,created_at,is_preview",
        filters: { status: "open" },
      });
      for (const r of remixRounds || []) {
        games.push({
          type: "remix_betr",
          id: r.id,
          title: r.round_label || "REMIX BETR Round",
          link: `/remix-betr?roundId=${r.id}`,
          created_at: r.created_at,
          is_preview: r.is_preview ?? false,
        });
      }

      // Poker - status = 'open' or 'registration_open' (burrfriends_games uses inserted_at, not created_at)
      const pokerGamesOpen = await pokerDb.fetch<{
        id: string;
        name: string;
        inserted_at: string;
        is_preview?: boolean;
      }>("burrfriends_games", {
        select: "id,name,inserted_at,is_preview",
        filters: { status_in: ["open", "registration_open"] },
      });
      for (const g of pokerGamesOpen || []) {
        games.push({
          type: "poker",
          id: g.id,
          title: g.name || "Poker Game",
          link: `/games/${g.id}`,
          created_at: g.inserted_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // SUPERBOWL SQUARES - status = 'setup' or 'claiming'
      const sbsGamesSetup = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
      }>("superbowl_squares_games", {
        select: "id,title,created_at",
        filters: { status: "setup" },
      });
      for (const g of sbsGamesSetup || []) {
        games.push({
          type: "superbowl_squares",
          id: g.id,
          title: g.title || "BETR SUPERBOWL PROPS",
          link: `/superbowl-squares?gameId=${g.id}`,
          created_at: g.created_at,
        });
      }
      const sbsGamesClaiming = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
      }>("superbowl_squares_games", {
        select: "id,title,created_at",
        filters: { status: "claiming" },
      });
      for (const g of sbsGamesClaiming || []) {
        games.push({
          type: "superbowl_squares",
          id: g.id,
          title: g.title || "BETR SUPERBOWL PROPS",
          link: `/superbowl-squares?gameId=${g.id}`,
          created_at: g.created_at,
        });
      }
    }

    if (status === 'inProgress') {
      // BUDDY UP - status = 'in_progress'
      const buddyUpGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("buddy_up_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of buddyUpGames || []) {
        games.push({
          type: "buddy_up",
          id: g.id,
          title: g.title || "BUDDY UP",
          link: `/buddy-up?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // THE MOLE - status = 'in_progress'
      const moleGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("mole_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of moleGames || []) {
        games.push({
          type: "the_mole",
          id: g.id,
          title: g.title || "THE MOLE",
          link: `/the-mole?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // STEAL OR NO STEAL - status = 'in_progress'
      const stealNoStealGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("steal_no_steal_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of stealNoStealGames || []) {
        const isHeadsUp = g.title === "HEADS UP Steal or No Steal";
        games.push({
          type: "steal_no_steal",
          id: g.id,
          title: g.title || "STEAL OR NO STEAL",
          link: isHeadsUp ? `/heads-up-steal-no-steal?gameId=${g.id}` : `/steal-no-steal?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // JENGA - status = 'in_progress'
      const jengaGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("jenga_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of jengaGames || []) {
        games.push({
          type: "jenga",
          id: g.id,
          title: g.title || "JENGA",
          link: `/jenga?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // BULLIED - status = 'in_progress'
      const bulliedGamesInProgress = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("bullied_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of bulliedGamesInProgress || []) {
        games.push({
          type: "bullied",
          id: g.id,
          title: g.title || "BULLIED",
          link: `/bullied?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // IN OR OUT - status = 'in_progress'
      const inOrOutGamesInProgress = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("in_or_out_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of inOrOutGamesInProgress || []) {
        games.push({
          type: "in_or_out",
          id: g.id,
          title: g.title || "IN OR OUT",
          link: `/in-or-out?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // TAKE FROM THE PILE - status = 'in_progress'
      const takeFromThePileGamesInProgress = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("take_from_the_pile_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of takeFromThePileGamesInProgress || []) {
        games.push({
          type: "take_from_the_pile",
          id: g.id,
          title: g.title || "TAKE FROM THE PILE",
          link: `/take-from-the-pile?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // KILL OR KEEP - status = 'in_progress'
      const killOrKeepGamesInProgress = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("kill_or_keep_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of killOrKeepGamesInProgress || []) {
        games.push({
          type: "kill_or_keep",
          id: g.id,
          title: g.title || "KILL OR KEEP",
          link: `/kill-or-keep?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // NL HOLDEM - status = 'in_progress'
      const nlHoldemGamesInProgress = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("nl_holdem_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of nlHoldemGamesInProgress || []) {
        games.push({
          type: "nl_holdem",
          id: g.id,
          title: g.title || "NL HOLDEM",
          link: `/nl-holdem?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // Poker - status = 'in_progress' (burrfriends_games uses inserted_at)
      const pokerGames = await pokerDb.fetch<{
        id: string;
        name: string;
        inserted_at: string;
        is_preview?: boolean;
      }>("burrfriends_games", {
        select: "id,name,inserted_at,is_preview",
        filters: { status: "in_progress" },
      });
      for (const g of pokerGames || []) {
        games.push({
          type: "poker",
          id: g.id,
          title: g.name || "Poker Game",
          link: `/games/${g.id}`,
          created_at: g.inserted_at,
          is_preview: g.is_preview ?? false,
        });
      }
    }

    if (status === 'needsAction') {
      // BETR GUESSER - status = 'closed'
      const betrGuesserGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("betr_guesser_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "closed" },
      });
      for (const g of betrGuesserGames || []) {
        games.push({
          type: "betr_guesser",
          id: g.id,
          title: g.title || "BETR GUESSER",
          link: `/betr-guesser?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // REMIX BETR - status = 'closed'
      const remixRounds = await pokerDb.fetch<{
        id: string;
        round_label: string;
        created_at: string;
        is_preview?: boolean;
      }>("remix_betr_rounds", {
        select: "id,round_label,created_at,is_preview",
        filters: { status: "closed" },
      });
      for (const r of remixRounds || []) {
        games.push({
          type: "remix_betr",
          id: r.id,
          title: r.round_label || "REMIX BETR Round",
          link: `/remix-betr?roundId=${r.id}`,
          created_at: r.created_at,
          is_preview: r.is_preview ?? false,
        });
      }

      // JENGA - status = 'completed'
      const jengaGames = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
        is_preview?: boolean;
      }>("jenga_games", {
        select: "id,title,created_at,is_preview",
        filters: { status: "completed" },
      });
      for (const g of jengaGames || []) {
        games.push({
          type: "jenga",
          id: g.id,
          title: g.title || "JENGA",
          link: `/jenga?gameId=${g.id}`,
          created_at: g.created_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // Poker - status = 'completed' (burrfriends_games uses inserted_at)
      const pokerGames = await pokerDb.fetch<{
        id: string;
        name: string;
        inserted_at: string;
        is_preview?: boolean;
      }>("burrfriends_games", {
        select: "id,name,inserted_at,is_preview",
        filters: { status: "completed" },
      });
      for (const g of pokerGames || []) {
        games.push({
          type: "poker",
          id: g.id,
          title: g.name || "Poker Game",
          link: `/games/${g.id}`,
          created_at: g.inserted_at,
          is_preview: g.is_preview ?? false,
        });
      }

      // SUPERBOWL SQUARES - status = 'locked' (needs results + settle)
      const sbsGamesLocked = await pokerDb.fetch<{
        id: string;
        title: string;
        created_at: string;
      }>("superbowl_squares_games", {
        select: "id,title,created_at",
        filters: { status: "locked" },
      });
      for (const g of sbsGamesLocked || []) {
        games.push({
          type: "superbowl_squares",
          id: g.id,
          title: g.title || "BETR SUPERBOWL PROPS",
          link: `/superbowl-squares?gameId=${g.id}`,
          created_at: g.created_at,
        });
      }
    }

    if (status === 'scheduled') {
      // Poker - status = 'scheduled' (burrfriends_games uses inserted_at)
      const pokerGames = await pokerDb.fetch<{
        id: string;
        name: string;
        inserted_at: string;
        is_preview?: boolean;
      }>("burrfriends_games", {
        select: "id,name,inserted_at,is_preview",
        filters: { status: "scheduled" },
      });
      for (const g of pokerGames || []) {
        games.push({
          type: "poker",
          id: g.id,
          title: g.name || "Poker Game",
          link: `/games/${g.id}`,
          created_at: g.inserted_at,
          is_preview: g.is_preview ?? false,
        });
      }
    }

    // Sort by created_at DESC (most recent first)
    games.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { games },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/games-by-status]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get games by status" },
      { status: 500 }
    );
  }
}
