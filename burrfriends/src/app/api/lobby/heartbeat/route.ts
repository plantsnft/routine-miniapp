/**
 * POST /api/lobby/heartbeat - Update presence and get active counts
 * 
 * Phase 19: Lobby Chat
 * Requires 1M+ BETR staked to access
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { checkStakeWithCache } from "~/lib/staking";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

const LOBBY_CHAT_MIN_STAKE = 1_000_000; // 1M BETR
const ACTIVE_THRESHOLD_SECONDS = 60;

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

    // Parse body for inChat flag
    const body = await req.json().catch(() => ({}));
    const inChat = Boolean(body.inChat);

    // Get user profile for caching
    let username: string | null = null;
    let displayName: string | null = null;
    let pfpUrl: string | null = null;

    try {
      const neynar = getNeynarClient();
      const users = await neynar.fetchBulkUsers({ fids: [fid] });
      if (users?.users?.[0]) {
        const user = users.users[0];
        username = user.username || null;
        displayName = user.display_name || null;
        pfpUrl = user.pfp_url || null;
      }
    } catch {
      // Profile fetch failed, continue without it
    }

    const now = new Date().toISOString();

    // When in_chat is true: upsert with chat_last_seen_at = now (marks lobby messages as read).
    // When in_chat is false: preserve existing chat_last_seen_at so unread count is correct.
    if (inChat) {
      await pokerDb.upsert("lobby_presence", [
        {
          fid,
          last_seen_at: now,
          in_chat: true,
          chat_last_seen_at: now,
          username,
          display_name: displayName,
          pfp_url: pfpUrl,
        },
      ]);
    } else {
      const existing = await pokerDb.fetch<{ chat_last_seen_at: string | null }>("lobby_presence", {
        filters: { fid },
        limit: 1,
      });
      const preserveChatLastSeen = existing?.[0]?.chat_last_seen_at ?? null;
      await pokerDb.upsert("lobby_presence", [
        {
          fid,
          last_seen_at: now,
          in_chat: false,
          chat_last_seen_at: preserveChatLastSeen,
          username,
          display_name: displayName,
          pfp_url: pfpUrl,
        },
      ]);
    }

    // Get active counts (pokerDb.fetch only supports eq filters, so we filter in JS)
    const cutoffDate = new Date(Date.now() - ACTIVE_THRESHOLD_SECONDS * 1000);
    
    // Fetch all presence records with profile data
    const allPresence = await pokerDb.fetch<{
      fid: number;
      last_seen_at: string;
      in_chat: boolean;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>(
      "lobby_presence",
      {
        select: "fid,last_seen_at,in_chat,username,display_name,pfp_url",
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
      data: {
        activeCount,
        inChatCount,
        activeUsers: activeUsers.map((u) => ({
          fid: u.fid,
          username: u.username,
          display_name: u.display_name,
          pfp_url: u.pfp_url,
          in_chat: u.in_chat,
        })),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[lobby/heartbeat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to update presence" }, { status: 500 });
  }
}
