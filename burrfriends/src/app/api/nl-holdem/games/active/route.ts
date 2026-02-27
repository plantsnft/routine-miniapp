/**
 * GET /api/nl-holdem/games/active - Active games (open + in_progress), excluding previews
 * Optional auth: when authenticated include unreadChatCount per game. Phase 40.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    let fid: number | null = null;
    try {
      const auth = await requireAuth(req);
      fid = auth.fid;
    } catch {
      // unauthenticated; no unreadChatCount per game
    }

    const openGames = await pokerDb.fetch<Record<string, unknown>>("nl_holdem_games", {
      filters: { status: "open", community: "betr" },
      order: "created_at.desc",
      limit: 10,
    });
    const inProgress = await pokerDb.fetch<Record<string, unknown>>("nl_holdem_games", {
      filters: { status: "in_progress", community: "betr" },
      order: "created_at.desc",
      limit: 10,
    });
    const allActive = [...(openGames || []), ...(inProgress || [])];
    const filtered = allActive.filter((g) => (g as { is_preview?: boolean }).is_preview !== true);

    if (fid == null) {
      return NextResponse.json<ApiResponse>({ ok: true, data: filtered });
    }

    const gameIds = filtered.map((g) => String((g as { id?: string }).id)).filter(Boolean);
    if (gameIds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: filtered });
    }

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
      filters: { game_id_in: gameIds },
      select: "game_id,created_at",
      limit: 2000,
    });

    const unreadByGame: Record<string, number> = {};
    for (const id of gameIds) unreadByGame[id] = 0;
    for (const m of messages || []) {
      const cutoff = cutoffByGame[m.game_id] ?? 0;
      if (new Date(m.created_at).getTime() > cutoff) {
        unreadByGame[m.game_id] = (unreadByGame[m.game_id] ?? 0) + 1;
      }
    }

    const data = filtered.map((g) => {
      const id = String((g as { id?: string }).id);
      return { ...g, unreadChatCount: unreadByGame[id] ?? 0 };
    });
    return NextResponse.json<ApiResponse>({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[nl-holdem/games/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch active games" }, { status: 500 });
  }
}
