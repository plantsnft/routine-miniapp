/**
 * GET /api/betr-guesser/games/[id]/chat/active - inChatCount, unreadChatCount
 * Phase 13.10. Game must be open; access = has guessed or admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const ACTIVE_THRESHOLD_SECONDS = 60;

async function getGameStatus(gameId: string): Promise<string | null> {
  const games = await pokerDb.fetch<{ status: string }>("betr_guesser_games", {
    filters: { id: gameId },
    select: "status",
    limit: 1,
  });
  return games?.[0]?.status ?? null;
}

async function canAccessGameChat(fid: number, gameId: string): Promise<boolean> {
  if (isAdmin(fid)) return true;
  const guesses = await pokerDb.fetch<{ id: string }>("betr_guesser_guesses", {
    filters: { game_id: gameId, fid },
    limit: 1,
  });
  return Boolean(guesses && guesses.length > 0);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const status = await getGameStatus(gameId);
    if (!status || status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Chat is only available while the game is open" }, { status: 400 });
    }

    const hasAccess = await canAccessGameChat(fid, gameId);
    if (!hasAccess) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You don't have access to this game's chat" }, { status: 403 });
    }

    const cutoffDate = new Date(Date.now() - ACTIVE_THRESHOLD_SECONDS * 1000);

    const myPresence = await pokerDb.fetch<{ chat_last_seen_at: string | null }>("betr_guesser_game_chat_presence", {
      filters: { game_id: gameId, fid },
      limit: 1,
    });
    const chatLastSeenAt = myPresence?.[0]?.chat_last_seen_at ?? null;
    const unreadCutoffMs = chatLastSeenAt ? new Date(chatLastSeenAt).getTime() : 0;

    const allMessages = await pokerDb.fetch<{ created_at: string }>("betr_guesser_game_chat_messages", {
      filters: { game_id: gameId },
      select: "created_at",
      limit: 500,
    });
    const unreadChatCount = (allMessages || []).filter((m) => new Date(m.created_at).getTime() > unreadCutoffMs).length;

    const allPresence = await pokerDb.fetch<{ fid: number; chat_last_seen_at: string | null }>(
      "betr_guesser_game_chat_presence",
      {
        filters: { game_id: gameId },
        select: "fid,chat_last_seen_at",
        limit: 100,
      }
    );
    const inChatCount = (allPresence || []).filter(
      (p) => p.chat_last_seen_at != null && new Date(p.chat_last_seen_at) > cutoffDate
    ).length;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { inChatCount, unreadChatCount },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/chat/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get active counts" }, { status: 500 });
  }
}
