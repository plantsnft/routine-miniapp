/**
 * GET /api/beta/preview-games - Get preview games (admin or beta access)
 * Phase 29.2: Beta Testing
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { hasBetaAccess } from "~/lib/beta";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

interface PreviewGame {
  table: string;
  gameType: string;
  id: string;
  title: string;
  prize_amount: number;
  status: string;
  created_at: string;
  created_by_fid: number;
  [key: string]: unknown;
}

const GAME_TABLES: { table: string; gameType: string; select: string }[] = [
  { table: "burrfriends_games", gameType: "Poker", select: "id, name, status, prize_amounts, prize_currency, max_participants, game_type, created_at, created_by_fid, is_preview" },
  { table: "betr_guesser_games", gameType: "BETR GUESSER", select: "id, title, prize_amount, status, guesses_close_at, created_at, created_by_fid, is_preview" },
  { table: "buddy_up_games", gameType: "BUDDY UP", select: "id, title, prize_amount, status, created_at, created_by_fid, is_preview" },
  { table: "jenga_games", gameType: "JENGA", select: "id, title, prize_amount, status, turn_time_seconds, created_at, created_by_fid, is_preview" },
  { table: "mole_games", gameType: "THE MOLE", select: "id, title, prize_amount, status, created_at, created_by_fid, is_preview" },
  { table: "steal_no_steal_games", gameType: "STEAL OR NO STEAL", select: "id, title, prize_amount, status, decision_time_seconds, created_at, created_by_fid, is_preview" },
  { table: "remix_betr_rounds", gameType: "FRAMEDL BETR", select: "id, round_label, prize_amount, status, submissions_close_at, game_date, created_at, created_by_fid, is_preview" },
  { table: "weekend_game_rounds", gameType: "WEEKEND GAME", select: "id, round_label, prize_amount, status, submissions_close_at, created_at, created_by_fid, is_preview" },
  { table: "bullied_games", gameType: "BULLIED", select: "id, title, status, created_at, created_by_fid, is_preview" },
  { table: "in_or_out_games", gameType: "IN OR OUT", select: "id, title, status, created_at, created_by_fid, is_preview" },
  { table: "take_from_the_pile_games", gameType: "TAKE FROM THE PILE", select: "id, title, status, prize_pool_amount, created_at, created_by_fid, is_preview" },
  { table: "kill_or_keep_games", gameType: "KILL OR KEEP", select: "id, title, status, created_at, created_by_fid, is_preview" },
  { table: "art_contest", gameType: "ART CONTEST", select: "id, title, status, created_at, created_by_fid, is_preview" },
  { table: "sunday_high_stakes", gameType: "SUNDAY HIGH STAKES ARE BETR", select: "id, title, status, created_at, created_by_fid, is_preview" },
  { table: "nl_holdem_games", gameType: "NL HOLDEM", select: "id, title, status, prize_amounts, created_at, created_by_fid, is_preview" },
  { table: "ncaa_hoops_contests", gameType: "NCAA HOOPS", select: "id, title, status, picks_close_at, created_at, created_by_fid, is_preview" },
];

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    if (!isAdmin(fid) && !hasBetaAccess(req)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Beta access or admin required" },
        { status: 403 }
      );
    }

    const results = await Promise.all(
      GAME_TABLES.map(async ({ table, gameType, select }) => {
        try {
          const games = await pokerDb.fetch<any>(table, {
            filters: { is_preview: true },
            select,
            order: "created_at.desc",
            limit: 50,
          });
          return (games || []).map((g: any) => ({
            ...g,
            table,
            gameType,
            title: g.title || g.name || g.round_label || gameType,
            prize_amount: table === "art_contest" || table === "sunday_high_stakes" || table === "ncaa_hoops_contests" ? 0 : (g.prize_amount ?? g.prize_pool_amount ?? (
              g.table === "in_or_out_games"
                ? 10_000_000
                : Array.isArray(g.prize_amounts)
                  ? g.prize_amounts.reduce((sum: number, amt: number) => sum + (Number(amt) || 0), 0)
                  : 0
            )),
          }));
        } catch (err) {
          console.error(`[beta/preview-games] Error fetching ${table}:`, err);
          return [];
        }
      })
    );

    const allPreviewGames: PreviewGame[] = results
      .flat()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json<ApiResponse>({ ok: true, data: allPreviewGames });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[beta/preview-games GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch preview games" }, { status: 500 });
  }
}
