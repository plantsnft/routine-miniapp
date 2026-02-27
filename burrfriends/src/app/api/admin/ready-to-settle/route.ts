/**
 * GET /api/admin/ready-to-settle
 * Returns list of games ready to settle with full details
 * 
 * Phase 18.1: Admin Dashboard v2
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

interface ReadyGame {
  type: string;
  id: string;
  title: string;
  prize_pool: number;
  created_at: string;
  link: string;
  is_preview?: boolean;
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

    const games: ReadyGame[] = [];

    // BETR GUESSER - status = 'closed' means ready to settle
    const betrGuesserGames = await pokerDb.fetch<{
      id: string;
      title: string;
      prize_amount: number;
      created_at: string;
      status: string;
      is_preview?: boolean;
    }>("betr_guesser_games", {
      select: "id,title,prize_amount,created_at,status,is_preview",
      filters: { status: "closed" },
    });
    for (const g of betrGuesserGames || []) {
      games.push({
        type: "betr_guesser",
        id: g.id,
        title: g.title || "BETR GUESSER",
        prize_pool: g.prize_amount || 0,
        created_at: g.created_at,
        link: `/betr-guesser?gameId=${g.id}`,
        is_preview: g.is_preview ?? false,
      });
    }

    // REMIX BETR - rounds with status = 'closed' ready to settle
    const remixRounds = await pokerDb.fetch<{
      id: string;
      round_label: string;
      created_at: string;
      status: string;
      is_preview?: boolean;
    }>("remix_betr_rounds", {
      select: "id,round_label,created_at,status,is_preview",
      filters: { status: "closed" },
    });
    for (const r of remixRounds || []) {
      games.push({
        type: "remix_betr",
        id: r.id,
        title: r.round_label || "REMIX BETR Round",
        prize_pool: 0, // Prize set at settlement
        created_at: r.created_at,
        link: `/remix-betr?roundId=${r.id}`,
        is_preview: r.is_preview ?? false,
      });
    }

    // JENGA - status = 'completed' ready to settle
    const jengaGames = await pokerDb.fetch<{
      id: string;
      title: string;
      prize_amount: number;
      created_at: string;
      status: string;
      is_preview?: boolean;
    }>("jenga_games", {
      select: "id,title,prize_amount,created_at,status,is_preview",
      filters: { status: "completed" },
    });
    for (const g of jengaGames || []) {
      games.push({
        type: "jenga",
        id: g.id,
        title: g.title || "JENGA",
        prize_pool: g.prize_amount || 0,
        created_at: g.created_at,
        link: `/jenga?gameId=${g.id}`,
        is_preview: g.is_preview ?? false,
      });
    }

    // SUPERBOWL SQUARES - status = 'locked' ready to settle (results + settle)
    const sbsGames = await pokerDb.fetch<{
      id: string;
      title: string;
      total_prize_pool: number;
      created_at: string;
      status: string;
    }>("superbowl_squares_games", {
      select: "id,title,total_prize_pool,created_at,status",
      filters: { status: "locked" },
    });
    for (const g of sbsGames || []) {
      games.push({
        type: "superbowl_squares",
        id: g.id,
        title: g.title || "BETR SUPERBOWL PROPS",
        prize_pool: Number(g.total_prize_pool) || 0,
        created_at: g.created_at,
        link: `/superbowl-squares?gameId=${g.id}`,
      });
    }

    // Poker - status = 'completed' ready to settle (burrfriends_games)
    const pokerGames = await pokerDb.fetch<{
      id: string;
      name: string;
      buy_in_amount: number;
      inserted_at: string;
      status: string;
      is_preview?: boolean;
    }>("burrfriends_games", {
      select: "id,name,buy_in_amount,inserted_at,status,is_preview",
      filters: { status: "completed" },
    });
    for (const g of pokerGames || []) {
      games.push({
        type: "poker",
        id: g.id,
        title: g.name || "Poker Game",
        prize_pool: Number(g.buy_in_amount) || 0,
        created_at: g.inserted_at,
        link: `/games/${g.id}`,
        is_preview: g.is_preview ?? false,
      });
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
    console.error("[admin/ready-to-settle]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get ready to settle games" },
      { status: 500 }
    );
  }
}
