/**
 * POST /api/betr-guesser/games/[id]/chat/heartbeat - Update presence; when inChat true set chat_last_seen_at
 * Phase 13.10. Game must be open; access = has guessed or admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

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

export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const inChat = Boolean(body.inChat);

    const now = new Date().toISOString();
    const existing = await pokerDb.fetch<{ game_id: string; fid: number }>("betr_guesser_game_chat_presence", {
      filters: { game_id: gameId, fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      if (inChat) {
        await pokerDb.update(
          "betr_guesser_game_chat_presence",
          { game_id: gameId, fid },
          { chat_last_seen_at: now }
        );
      }
    } else {
      await pokerDb.insert("betr_guesser_game_chat_presence", [
        {
          game_id: gameId,
          fid,
          chat_last_seen_at: inChat ? now : null,
        },
      ]);
    }

    return NextResponse.json<ApiResponse>({ ok: true });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/chat/heartbeat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to update presence" }, { status: 500 });
  }
}
