/**
 * GET/POST /api/lobby/chat - Get messages / Send message
 * 
 * Phase 19: Lobby Chat
 * Requires 1M+ BETR staked to access
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { checkStakeWithCache } from "~/lib/staking";
import type { ApiResponse } from "~/lib/types";

const LOBBY_CHAT_MIN_STAKE = 1_000_000; // 1M BETR
const MAX_MESSAGES = 500;
const MESSAGE_MAX_LENGTH = 500;

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Check 1M stake requirement (with cache to avoid RPC rate limits)
    const stakeResult = await checkStakeWithCache(fid, LOBBY_CHAT_MIN_STAKE);
    if (!stakeResult.meetsRequirement) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Requires 1M BETR staked to access lobby chat" },
        { status: 403 }
      );
    }

    // Get last 100 messages (most recent first, then reverse for display)
    const messages = await pokerDb.fetch<{
      id: string;
      sender_fid: number;
      message: string;
      created_at: string;
    }>("lobby_chat_messages", {
      select: "id,sender_fid,message,created_at",
      order: "created_at.desc",
      limit: 100,
    });

    if (!messages || messages.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: [] });
    }

    // Get sender profiles from presence table (fetch all, filter in JS - pokerDb only supports eq filters)
    const senderFids = new Set(messages.map((m) => m.sender_fid));
    const allProfiles = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("lobby_presence", {
      select: "fid,username,display_name,pfp_url",
      limit: 1000,
    });

    const profileMap = new Map<number, { username: string | null; display_name: string | null; pfp_url: string | null }>();
    for (const p of allProfiles || []) {
      if (senderFids.has(Number(p.fid))) {
        profileMap.set(Number(p.fid), { username: p.username, display_name: p.display_name, pfp_url: p.pfp_url });
      }
    }

    const messageIds = messages.map((m) => m.id);
    const reactionsList = messageIds.length > 0
      ? await pokerDb.fetch<{ message_id: string; fid: number; reaction: string }>("lobby_chat_reactions", {
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
        const key = r.reaction as 'thumbs_up' | 'x' | 'fire' | 'scream';
        if (key in counts) counts[key]++;
        if (Number(r.fid) === fid) myReactionByMessage.set(r.message_id, r.reaction);
      }
    }

    const enrichedMessages = messages.map((m) => {
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
    console.error("[lobby/chat GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    // Check 1M stake requirement (with cache to avoid RPC rate limits)
    const stakeResult = await checkStakeWithCache(fid, LOBBY_CHAT_MIN_STAKE);
    if (!stakeResult.meetsRequirement) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Requires 1M BETR staked to access lobby chat" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();

    if (!message) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message is required" }, { status: 400 });
    }

    if (message.length > MESSAGE_MAX_LENGTH) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Message too long (max ${MESSAGE_MAX_LENGTH} chars)` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Insert message
    await pokerDb.insert("lobby_chat_messages", [
      {
        sender_fid: fid,
        message,
        created_at: now,
      },
    ]);

    // Cleanup old messages beyond MAX_MESSAGES
    // Get the ID of the 500th newest message
    const keepMessages = await pokerDb.fetch<{ id: string }>(
      "lobby_chat_messages",
      {
        select: "id",
        order: "created_at.desc",
        limit: MAX_MESSAGES,
      }
    );

    if (keepMessages && keepMessages.length === MAX_MESSAGES) {
      const keepIds = keepMessages.map((m) => m.id);
      // Delete messages not in the keep list
      // Since pokerDb doesn't support complex deletes, we'll do a simple approach:
      // Get all messages and delete ones not in keepIds
      const allMessages = await pokerDb.fetch<{ id: string }>(
        "lobby_chat_messages",
        {
          select: "id",
          limit: 1000,
        }
      );

      if (allMessages && allMessages.length > MAX_MESSAGES) {
        const keepSet = new Set(keepIds);
        const toDelete = allMessages.filter((m) => !keepSet.has(m.id));
        for (const m of toDelete) {
          await pokerDb.delete("lobby_chat_messages", { id: m.id });
        }
      }
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: { sent: true } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[lobby/chat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to send message" }, { status: 500 });
  }
}
