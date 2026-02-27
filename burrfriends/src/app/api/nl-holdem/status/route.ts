/**
 * GET /api/nl-holdem/status - Registration/eligibility and active games for NL HOLDEM.
 * Phase 29.1 Layer 2: return registered true when isGlobalAdmin(fid).
 * Phase 40: activeGames[] (gameId, gameStatus, unreadChatCount) for user's open/in_progress games.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isGlobalAdmin } from "~/lib/permissions";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const registeredRows = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
      filters: { fid },
      limit: 1,
    });
    const isRegistered = Boolean(registeredRows && registeredRows.length > 0);

    const signups = await pokerDb.fetch<{ game_id: string }>("nl_holdem_signups", {
      filters: { fid },
      select: "game_id",
      limit: 50,
    });
    const signupGameIds = [...new Set((signups || []).map((s) => s.game_id))];
    let activeGames: Array<{ gameId: string; gameStatus: string; unreadChatCount: number }> = [];

    if (signupGameIds.length > 0) {
      const games = await pokerDb.fetch<{ id: string; title: string; status: string }>("nl_holdem_games", {
        filters: { id_in: signupGameIds, status_in: ["open", "in_progress"] },
        select: "id,title,status",
        limit: 50,
      });
      const myGameIds = (games || []).map((g) => g.id);
      if (myGameIds.length > 0) {
        const presence = await pokerDb.fetch<{ game_id: string; chat_last_seen_at: string | null }>("nl_holdem_chat_presence", {
          filters: { fid },
          select: "game_id,chat_last_seen_at",
          limit: 100,
        });
        const cutoffByGame: Record<string, number> = {};
        for (const p of presence || []) {
          cutoffByGame[p.game_id] = p.chat_last_seen_at ? new Date(p.chat_last_seen_at).getTime() : 0;
        }
        const messages = await pokerDb.fetch<{ game_id: string; created_at: string }>("nl_holdem_chat_messages", {
          filters: { game_id_in: myGameIds },
          select: "game_id,created_at",
          limit: 2000,
        });
        const unreadByGame: Record<string, number> = {};
        for (const id of myGameIds) unreadByGame[id] = 0;
        for (const m of messages || []) {
          const cutoff = cutoffByGame[m.game_id] ?? 0;
          if (new Date(m.created_at).getTime() > cutoff) {
            unreadByGame[m.game_id] = (unreadByGame[m.game_id] ?? 0) + 1;
          }
        }
        activeGames = (games || []).map((g) => ({
          gameId: g.id,
          title: g.title ?? `Game ${g.id.slice(0, 8)}`,
          gameStatus: g.status,
          unreadChatCount: unreadByGame[g.id] ?? 0,
        }));
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        registered: isGlobalAdmin(fid) ? true : isRegistered,
        approved: isGlobalAdmin(fid) ? true : isRegistered,
        rejected: false,
        canPlay: isGlobalAdmin(fid) ? true : isRegistered,
        activeGames,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[nl-holdem/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get status" }, { status: 500 });
  }
}
