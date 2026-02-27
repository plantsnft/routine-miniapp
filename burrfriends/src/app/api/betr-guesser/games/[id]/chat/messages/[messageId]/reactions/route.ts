/**
 * POST /api/betr-guesser/games/[id]/chat/messages/[messageId]/reactions
 * Set, change, or remove reaction. Access: has guessed or admin; game must be open.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const VALID_REACTIONS = ["thumbs_up", "x", "fire", "scream"] as const;

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
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId, messageId } = await params;

    const body = await req.json().catch(() => ({}));
    const reaction = typeof body.reaction === "string" ? body.reaction : "";

    if (reaction && !VALID_REACTIONS.includes(reaction as (typeof VALID_REACTIONS)[number])) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid reaction" }, { status: 400 });
    }

    const messages = await pokerDb.fetch<{ id: string; game_id: string }>("betr_guesser_game_chat_messages", {
      filters: { id: messageId },
      limit: 1,
    });
    if (!messages || messages.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message not found" }, { status: 404 });
    }
    if (messages[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message not found" }, { status: 404 });
    }

    const hasAccess = await canAccessGameChat(fid, gameId);
    if (!hasAccess) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You don't have access to this chat" }, { status: 403 });
    }

    const games = await pokerDb.fetch<{ status: string }>("betr_guesser_games", {
      filters: { id: gameId },
      select: "status",
      limit: 1,
    });
    if (games?.[0]?.status !== "open") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Chat is only available while the game is open" }, { status: 400 });
    }

    const existing = await pokerDb.fetch<{ reaction: string }>("betr_guesser_game_chat_reactions", {
      filters: { message_id: messageId, fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      if (!reaction || existing[0].reaction === reaction) {
        await pokerDb.delete("betr_guesser_game_chat_reactions", { message_id: messageId, fid });
        return NextResponse.json<ApiResponse>({
          ok: true,
          data: { reaction: null, counts: await getCounts(messageId) },
        });
      }
      await pokerDb.delete("betr_guesser_game_chat_reactions", { message_id: messageId, fid });
    }

    if (reaction) {
      await pokerDb.insert("betr_guesser_game_chat_reactions", [{ message_id: messageId, fid, reaction }]);
    }

    const counts = await getCounts(messageId);
    return NextResponse.json<ApiResponse>({ ok: true, data: { reaction: reaction || null, counts } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/chat/messages/[messageId]/reactions POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to set reaction" }, { status: 500 });
  }
}

async function getCounts(messageId: string): Promise<{ thumbs_up: number; x: number; fire: number; scream: number }> {
  const rows = await pokerDb.fetch<{ reaction: string }>("betr_guesser_game_chat_reactions", {
    filters: { message_id: messageId },
    limit: 500,
  });
  const counts = { thumbs_up: 0, x: 0, fire: 0, scream: 0 };
  for (const r of rows || []) {
    if (r.reaction in counts) (counts as Record<string, number>)[r.reaction]++;
  }
  return counts;
}
