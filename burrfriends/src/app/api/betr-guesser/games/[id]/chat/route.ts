/**
 * GET/POST /api/betr-guesser/games/[id]/chat - List messages / Send message
 * Phase 13.10. Access: has guessed in this game or admin. Game must be open.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

const MAX_MESSAGES = 100;
const MESSAGE_MAX_LENGTH = 500;

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

    const messages = await pokerDb.fetch<{
      id: string;
      sender_fid: number;
      message: string;
      created_at: string;
    }>("betr_guesser_game_chat_messages", {
      filters: { game_id: gameId },
      order: "created_at.desc",
      limit: MAX_MESSAGES,
    });

    if (!messages || messages.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    const senderFids = [...new Set(messages.map((m) => Number(m.sender_fid)))];
    const userMap: Record<number, CachedProfileData> = {};
    const { cached, needFetch } = getProfilesFromCache(senderFids);
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
        console.warn("[betr-guesser/games/[id]/chat] fetchBulkUsers failed:", e);
      }
    }

    const messageIds = messages.map((m) => m.id);
    const reactionsList =
      messageIds.length > 0
        ? await pokerDb.fetch<{ message_id: string; fid: number; reaction: string }>("betr_guesser_game_chat_reactions", {
            filters: { message_id_in: messageIds },
            limit: 2000,
          })
        : [];
    const reactionCountsByMessage = new Map<string, { thumbs_up: number; x: number; fire: number; scream: number }>();
    const myReactionByMessage = new Map<string, string>();
    for (const m of messages) {
      reactionCountsByMessage.set(m.id, { thumbs_up: 0, x: 0, fire: 0, scream: 0 });
    }
    for (const r of reactionsList || []) {
      const counts = reactionCountsByMessage.get(r.message_id);
      if (counts) {
        const key = r.reaction as "thumbs_up" | "x" | "fire" | "scream";
        if (key in counts) counts[key]++;
        if (Number(r.fid) === fid) myReactionByMessage.set(r.message_id, r.reaction);
      }
    }

    const enrichedMessages = messages.map((m) => {
      const prof = userMap[Number(m.sender_fid)];
      return {
        id: m.id,
        senderFid: m.sender_fid,
        message: m.message,
        createdAt: m.created_at,
        sender: {
          fid: m.sender_fid,
          username: prof?.username ?? null,
          display_name: prof?.display_name ?? null,
          pfp_url: prof?.pfp_url ?? null,
        },
        reactions: reactionCountsByMessage.get(m.id) ?? { thumbs_up: 0, x: 0, fire: 0, scream: 0 },
        myReaction: myReactionByMessage.get(m.id) ?? null,
      };
    });

    return NextResponse.json<ApiResponse>({ ok: true, data: enrichedMessages });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/chat GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch messages" }, { status: 500 });
  }
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
    const message = typeof body.message === "string" ? body.message.trim().slice(0, MESSAGE_MAX_LENGTH) : "";
    if (!message) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const inserted = await pokerDb.insert(
      "betr_guesser_game_chat_messages",
      [{ game_id: gameId, sender_fid: fid, message, created_at: now }],
      "id,sender_fid,message,created_at"
    );
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to send message" }, { status: 500 });
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        id: (row as any).id,
        senderFid: (row as any).sender_fid,
        message: (row as any).message,
        createdAt: (row as any).created_at,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/chat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to send message" }, { status: 500 });
  }
}
