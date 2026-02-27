/**
 * GET /api/bullied/games/[id]/groups/[groupId]/chat - Get chat messages for a group
 * POST /api/bullied/games/[id]/groups/[groupId]/chat - Send a message to group chat
 *
 * Access: user must be in group OR isAdmin(fid).
 * Profile hydration uses Neynar cache pattern (no signups table in BULLIED).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import type { ApiResponse } from "~/lib/types";

async function canAccessGroupChat(fid: number, groupId: string): Promise<boolean> {
  if (isAdmin(fid)) return true;
  const groups = await pokerDb.fetch<{ fids: number[] }>("bullied_groups", {
    filters: { id: groupId },
    limit: 1,
  });
  if (!groups || groups.length === 0) return false;
  return (groups[0].fids || []).includes(Number(fid));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId, groupId } = await params;

    const hasAccess = await canAccessGroupChat(fid, groupId);
    if (!hasAccess) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You don't have access to this group's chat" }, { status: 403 });
    }

    // Verify group belongs to game
    const groups = await pokerDb.fetch<{ id: string; round_id: string }>("bullied_groups", {
      filters: { id: groupId },
      limit: 1,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const group = groups[0];
    const rounds = await pokerDb.fetch<{ id: string; game_id: string }>("bullied_rounds", {
      filters: { id: group.round_id },
      limit: 1,
    });

    if (!rounds || rounds.length === 0 || rounds[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group does not belong to this game" }, { status: 400 });
    }

    // Get messages (most recent 100, newest first)
    const messages = await pokerDb.fetch<{
      id: string;
      sender_fid: number;
      message: string;
      created_at: string;
    }>("bullied_chat_messages", {
      filters: { group_id: groupId },
      limit: 100,
      order: "created_at.desc",
    });

    const sortedMessages = (messages || []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Hydrate sender profiles via Neynar cache
    const senderFids = [...new Set(sortedMessages.map((m) => Number(m.sender_fid)))];
    const userMap: Record<number, CachedProfileData> = {};

    if (senderFids.length > 0) {
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
          console.warn("[bullied/games/[id]/groups/[groupId]/chat GET] fetchBulkUsers failed:", e);
        }
      }
    }

    const messageIds = sortedMessages.map((m) => m.id);
    const reactionsList = messageIds.length > 0
      ? await pokerDb.fetch<{ message_id: string; fid: number; reaction: string }>("bullied_chat_reactions", {
          filters: { message_id_in: messageIds },
          limit: 2000,
        })
      : [];
    const reactionCountsByMessage = new Map<string, { thumbs_up: number; x: number; fire: number; scream: number }>();
    const myReactionByMessage = new Map<string, string>();
    for (const m of sortedMessages) {
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

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: sortedMessages.map((m) => ({
        id: m.id,
        senderFid: Number(m.sender_fid),
        message: m.message,
        createdAt: m.created_at,
        sender: {
          fid: Number(m.sender_fid),
          username: userMap[Number(m.sender_fid)]?.username || null,
          display_name: userMap[Number(m.sender_fid)]?.display_name || null,
          pfp_url: userMap[Number(m.sender_fid)]?.pfp_url || null,
        },
        reactions: reactionCountsByMessage.get(m.id) ?? { thumbs_up: 0, x: 0, fire: 0, scream: 0 },
        myReaction: myReactionByMessage.get(m.id) ?? null,
      })),
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[bullied/games/[id]/groups/[groupId]/chat GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch chat messages" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId, groupId } = await params;
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";

    // Validate message
    if (!message || message.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message cannot be empty" }, { status: 400 });
    }

    if (message.length > 1000) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message must be 1000 characters or less" }, { status: 400 });
    }

    const hasAccess = await canAccessGroupChat(fid, groupId);
    if (!hasAccess) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You don't have access to this group's chat" }, { status: 403 });
    }

    // Verify group exists and belongs to game
    const groups = await pokerDb.fetch<{ id: string; round_id: string; status: string }>("bullied_groups", {
      filters: { id: groupId },
      limit: 1,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const group = groups[0];
    const rounds = await pokerDb.fetch<{ id: string; game_id: string; status: string }>("bullied_rounds", {
      filters: { id: group.round_id },
      limit: 1,
    });

    if (!rounds || rounds.length === 0 || rounds[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group does not belong to this game" }, { status: 400 });
    }

    // Verify game is in progress and round is active
    const games = await pokerDb.fetch<{ id: string; status: string }>("bullied_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0 || games[0].status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Chat is only available during active rounds" }, { status: 400 });
    }

    const round = rounds[0];
    if (round.status !== "voting" && round.status !== "grouping") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Chat is only available during voting phase" }, { status: 400 });
    }

    // Insert message
    const now = new Date().toISOString();
    const inserted = await pokerDb.insert(
      "bullied_chat_messages",
      [
        {
          group_id: groupId,
          sender_fid: fid,
          message,
          created_at: now,
          updated_at: now,
        },
      ],
      "id"
    );

    if (!inserted || inserted.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to send message" }, { status: 500 });
    }

    // Hydrate sender profile via Neynar cache
    const senderFids = [Number(fid)];
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
        console.warn("[bullied/games/[id]/groups/[groupId]/chat POST] fetchBulkUsers failed:", e);
      }
    }

    const sender = {
      fid: Number(fid),
      username: userMap[Number(fid)]?.username || null,
      display_name: userMap[Number(fid)]?.display_name || null,
      pfp_url: userMap[Number(fid)]?.pfp_url || null,
    };

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        id: (inserted[0] as unknown as { id: string }).id,
        senderFid: Number(fid),
        message,
        createdAt: now,
        sender,
        reactions: { thumbs_up: 0, x: 0, fire: 0, scream: 0 },
        myReaction: null,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[bullied/games/[id]/groups/[groupId]/chat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to send message" }, { status: 500 });
  }
}
