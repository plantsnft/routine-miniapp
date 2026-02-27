/**
 * GET/POST /api/steal-no-steal/games/[id]/matches/[matchId]/chat - Chat messages
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId, matchId } = await params;

    // Get match
    const matches = await pokerDb.fetch<{
      id: string;
      player_a_fid: number;
      player_b_fid: number;
      status: string;
    }>("steal_no_steal_matches", {
      filters: { id: matchId },
      limit: 1,
    });

    if (!matches || matches.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Match not found" }, { status: 404 });
    }

    const match = matches[0];

    // Check authorization: must be player in match or admin
    const isPlayerInMatch = Number(match.player_a_fid) === fid || Number(match.player_b_fid) === fid;
    if (!isPlayerInMatch && !isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Not authorized to view this chat" }, { status: 403 });
    }

    // Get messages
    const messages = await pokerDb.fetch<{
      id: string;
      sender_fid: number;
      message: string;
      created_at: string;
    }>("steal_no_steal_chat_messages", {
      filters: { match_id: matchId },
      order: "created_at.desc",
      limit: 100,
    });

    // Get sender profiles
    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("steal_no_steal_signups", {
      filters: { game_id: gameId },
      limit: 100,
    });

    const profileMap = new Map<number, { username: string | null; display_name: string | null; pfp_url: string | null }>();
    for (const s of signups || []) {
      profileMap.set(Number(s.fid), { username: s.username, display_name: s.display_name, pfp_url: s.pfp_url });
    }

    const messageIds = (messages || []).map((m) => m.id);
    const reactionsList = messageIds.length > 0
      ? await pokerDb.fetch<{ message_id: string; fid: number; reaction: string }>("steal_no_steal_chat_reactions", {
          filters: { message_id_in: messageIds },
          limit: 2000,
        })
      : [];
    const reactionCountsByMessage = new Map<string, { thumbs_up: number; x: number; fire: number; scream: number }>();
    const myReactionByMessage = new Map<string, string>();
    for (const m of messages || []) {
      reactionCountsByMessage.set(m.id, { thumbs_up: 0, x: 0, fire: 0, scream: 0 });
    }
    for (const r of reactionsList || []) {
      const counts = reactionCountsByMessage.get(r.message_id);
      if (counts) {
        const key = r.reaction as 'thumbs_up' | 'x' | 'fire' | 'scream';
        if (key in counts) counts[key]++;
        if (Number(r.fid) === fid) myReactionByMessage.set(r.message_id, r.reaction);
      }
    }

    const enrichedMessages = (messages || []).map((m) => {
      const prof = profileMap.get(Number(m.sender_fid));
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
    console.error("[steal-no-steal/games/[id]/matches/[matchId]/chat GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId, matchId } = await params;
    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();

    if (!message) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message is required" }, { status: 400 });
    }

    if (message.length > 1000) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message too long (max 1000 chars)" }, { status: 400 });
    }

    // Get match
    const matches = await pokerDb.fetch<{
      id: string;
      player_a_fid: number;
      player_b_fid: number;
      status: string;
    }>("steal_no_steal_matches", {
      filters: { id: matchId },
      limit: 1,
    });

    if (!matches || matches.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Match not found" }, { status: 404 });
    }

    const match = matches[0];

    // Check authorization: must be player in match or admin
    const isPlayerInMatch = Number(match.player_a_fid) === fid || Number(match.player_b_fid) === fid;
    if (!isPlayerInMatch && !isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Not authorized to send messages in this chat" }, { status: 403 });
    }

    // Check match is active
    if (match.status !== "active") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Chat is only available during active match" }, { status: 400 });
    }

    // Insert message
    const now = new Date().toISOString();
    await pokerDb.insert(
      "steal_no_steal_chat_messages",
      [
        {
          match_id: matchId,
          sender_fid: fid,
          message,
          created_at: now,
          updated_at: now,
        },
      ]
    );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { sent: true },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[steal-no-steal/games/[id]/matches/[matchId]/chat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to send message" }, { status: 500 });
  }
}
