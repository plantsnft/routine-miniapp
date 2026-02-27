/**
 * GET /api/admin/scheduled-games
 * Returns games with future auto_close_at times
 * 
 * Phase 18.1: Admin Dashboard v2
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

interface ScheduledGame {
  type: string;
  id: string;
  title: string;
  scheduled_time: string;
  status: string;
  link: string;
}

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const games: ScheduledGame[] = [];

    // BETR GUESSER - check auto_close_at
    try {
      const betrGuesserGames = await pokerDb.fetch<{
        id: string;
        title: string;
        auto_close_at: string;
        status: string;
      }>("betr_guesser_games", {
        select: "id,title,auto_close_at,status",
      });
      for (const g of betrGuesserGames || []) {
        if (g.auto_close_at && new Date(g.auto_close_at) > new Date(now) && g.status === 'open') {
          games.push({
            type: "betr_guesser",
            id: g.id,
            title: g.title || "BETR GUESSER",
            scheduled_time: g.auto_close_at,
            status: g.status,
            link: `/betr-guesser?gameId=${g.id}`,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/scheduled-games] Error querying betr_guesser_games:", e);
    }

    // BUDDY UP - check auto_close_at
    try {
      const buddyUpGames = await pokerDb.fetch<{
        id: string;
        title: string;
        auto_close_at: string;
        status: string;
      }>("buddy_up_games", {
        select: "id,title,auto_close_at,status",
      });
      for (const g of buddyUpGames || []) {
        if (g.auto_close_at && new Date(g.auto_close_at) > new Date(now) && g.status === 'signup') {
          games.push({
            type: "buddy_up",
            id: g.id,
            title: g.title || "BUDDY UP",
            scheduled_time: g.auto_close_at,
            status: g.status,
            link: `/buddy-up?gameId=${g.id}`,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/scheduled-games] Error querying buddy_up_games:", e);
    }

    // THE MOLE - check auto_close_at
    try {
      const moleGames = await pokerDb.fetch<{
        id: string;
        title: string;
        auto_close_at: string;
        status: string;
      }>("mole_games", {
        select: "id,title,auto_close_at,status",
      });
      for (const g of moleGames || []) {
        if (g.auto_close_at && new Date(g.auto_close_at) > new Date(now) && g.status === 'signup') {
          games.push({
            type: "the_mole",
            id: g.id,
            title: g.title || "THE MOLE",
            scheduled_time: g.auto_close_at,
            status: g.status,
            link: `/the-mole?gameId=${g.id}`,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/scheduled-games] Error querying mole_games:", e);
    }

    // STEAL OR NO STEAL - check auto_close_at
    try {
      const stealGames = await pokerDb.fetch<{
        id: string;
        title: string;
        auto_close_at: string;
        status: string;
      }>("steal_no_steal_games", {
        select: "id,title,auto_close_at,status",
      });
      for (const g of stealGames || []) {
        if (g.auto_close_at && new Date(g.auto_close_at) > new Date(now) && g.status === 'signup') {
          const isHeadsUp = g.title === "HEADS UP Steal or No Steal";
          games.push({
            type: "steal_no_steal",
            id: g.id,
            title: g.title || "STEAL OR NO STEAL",
            scheduled_time: g.auto_close_at,
            status: g.status,
            link: isHeadsUp ? `/heads-up-steal-no-steal?gameId=${g.id}` : `/steal-no-steal?gameId=${g.id}`,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/scheduled-games] Error querying steal_no_steal_games:", e);
    }

    // JENGA - check auto_close_at
    try {
      const jengaGames = await pokerDb.fetch<{
        id: string;
        title: string;
        auto_close_at: string;
        status: string;
      }>("jenga_games", {
        select: "id,title,auto_close_at,status",
      });
      for (const g of jengaGames || []) {
        if (g.auto_close_at && new Date(g.auto_close_at) > new Date(now) && g.status === 'signup') {
          games.push({
            type: "jenga",
            id: g.id,
            title: g.title || "JENGA",
            scheduled_time: g.auto_close_at,
            status: g.status,
            link: `/jenga?gameId=${g.id}`,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/scheduled-games] Error querying jenga_games:", e);
    }

    // REMIX BETR - check auto_close_at on rounds
    try {
      const remixRounds = await pokerDb.fetch<{
        id: string;
        round_label: string;
        auto_close_at: string;
        status: string;
      }>("remix_betr_rounds", {
        select: "id,round_label,auto_close_at,status",
      });
      for (const r of remixRounds || []) {
        if (r.auto_close_at && new Date(r.auto_close_at) > new Date(now) && r.status === 'open') {
          games.push({
            type: "remix_betr",
            id: r.id,
            title: r.round_label || "REMIX BETR Round",
            scheduled_time: r.auto_close_at,
            status: r.status,
            link: `/remix-betr?roundId=${r.id}`,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/scheduled-games] Error querying remix_betr_rounds:", e);
    }

    // Poker scheduled games (burrfriends_games uses game_date)
    try {
      const pokerGames = await pokerDb.fetch<{
        id: string;
        name: string;
        game_date: string;
        status: string;
      }>("burrfriends_games", {
        select: "id,name,game_date,status",
        filters: { status: "scheduled" },
      });
      for (const g of pokerGames || []) {
        if (g.game_date && new Date(g.game_date) > new Date(now)) {
          games.push({
            type: "poker",
            id: g.id,
            title: g.name || "Poker Game",
            scheduled_time: g.game_date,
            status: g.status,
            link: `/games/${g.id}`,
          });
        }
      }
    } catch (e) {
      console.warn("[admin/scheduled-games] Error querying burrfriends_games:", e);
    }

    // Sort by scheduled_time ASC (soonest first)
    games.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());

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
    console.error("[admin/scheduled-games]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get scheduled games" },
      { status: 500 }
    );
  }
}
