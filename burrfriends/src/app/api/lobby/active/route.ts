/**
 * GET /api/lobby/active - Get active user counts
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
const ACTIVE_THRESHOLD_SECONDS = 60;

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

    const cutoffDate = new Date(Date.now() - ACTIVE_THRESHOLD_SECONDS * 1000);

    // Current user's chat_last_seen_at for unread count (messages since they last had chat open)
    const myPresence = await pokerDb.fetch<{ chat_last_seen_at: string | null }>("lobby_presence", {
      filters: { fid },
      limit: 1,
    });
    const chatLastSeenAt = myPresence?.[0]?.chat_last_seen_at ?? null;
    const unreadCutoffMs = chatLastSeenAt ? new Date(chatLastSeenAt).getTime() : 0;

    const allMessages = await pokerDb.fetch<{ created_at: string }>("lobby_chat_messages", {
      select: "created_at",
      limit: 500,
    });
    const unreadChatCount = (allMessages || []).filter(
      (m) => new Date(m.created_at).getTime() > unreadCutoffMs
    ).length;

    // Fetch all presence records (pokerDb.fetch only supports eq filters, so we filter in JS)
    const allPresence = await pokerDb.fetch<{ fid: number; last_seen_at: string; in_chat: boolean }>(
      "lobby_presence",
      {
        select: "fid,last_seen_at,in_chat",
        limit: 1000,
      }
    );

    // Filter active users (last_seen_at within 60 seconds)
    const activeUsers = (allPresence || []).filter(
      (p) => new Date(p.last_seen_at) > cutoffDate
    );
    const activeCount = activeUsers.length;

    // Filter users in chat (active + in_chat = true)
    const inChatCount = activeUsers.filter((p) => p.in_chat).length;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { activeCount, inChatCount, unreadChatCount },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[lobby/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get active counts" }, { status: 500 });
  }
}
