/**
 * GET /api/buddy-up/games/[id]/groups/[groupId]/chat - Get chat messages for a group
 * POST /api/buddy-up/games/[id]/groups/[groupId]/chat - Send a message to group chat
 *
 * Same access as create games: in group or isAdmin(fid). Admins (plants, burr) serve as judges—full read and write.
 * 
 * OPTIMIZATION (§15.11.1): Reads sender profiles from buddy_up_signups table instead of Neynar.
 * All chat participants are signed up, so profiles exist in DB. Zero Neynar calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

async function canAccessGroupChat(fid: number, groupId: string): Promise<boolean> {
  if (isAdmin(fid)) return true;
  const groups = await pokerDb.fetch<{ fids: number[] }>("buddy_up_groups", {
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
    const groups = await pokerDb.fetch<{ id: string; round_id: string }>("buddy_up_groups", {
      filters: { id: groupId },
      limit: 1,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const group = groups[0];
    const rounds = await pokerDb.fetch<{ id: string; game_id: string }>("buddy_up_rounds", {
      filters: { id: group.round_id },
      limit: 1,
    });

    if (!rounds || rounds.length === 0 || rounds[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group does not belong to this game" }, { status: 400 });
    }

    // Get messages (most recent 100, newest first for UI: latest on top)
    const messages = await pokerDb.fetch<{
      id: string;
      sender_fid: number;
      message: string;
      created_at: string;
    }>("buddy_up_chat_messages", {
      filters: { group_id: groupId },
      limit: 100,
      order: "created_at.desc",
    });

    // Ensure newest first (in case PostgREST order is ignored or cached)
    const sortedMessages = (messages || []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // OPTIMIZATION: Get sender profiles from signups table (no Neynar calls)
    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("buddy_up_signups", {
      filters: { game_id: gameId },
      limit: 100,
    });

    const profileMap = new Map<number, { username: string | null; display_name: string | null; pfp_url: string | null }>();
    for (const s of signups || []) {
      profileMap.set(Number(s.fid), { username: s.username, display_name: s.display_name, pfp_url: s.pfp_url });
    }

    // App-wide chat reactions: fetch counts and current user's reaction per message
    const messageIds = (sortedMessages || []).map((m) => m.id);
    const reactionsList = messageIds.length > 0
      ? await pokerDb.fetch<{ message_id: string; fid: number; reaction: string }>("buddy_up_chat_reactions", {
          filters: { message_id_in: messageIds },
          limit: 2000,
        })
      : [];
    const reactionCountsByMessage = new Map<string, { thumbs_up: number; x: number; fire: number; scream: number }>();
    const myReactionByMessage = new Map<string, string>();
    for (const m of sortedMessages || []) {
      reactionCountsByMessage.set(m.id, { thumbs_up: 0, x: 0, fire: 0, scream: 0 });
    }
    for (const r of reactionsList || []) {
      const msgId = r.message_id;
      const counts = reactionCountsByMessage.get(msgId);
      if (counts) {
        const key = r.reaction as 'thumbs_up' | 'x' | 'fire' | 'scream';
        if (key in counts) counts[key]++;
        if (Number(r.fid) === fid) myReactionByMessage.set(msgId, r.reaction);
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
          username: profileMap.get(Number(m.sender_fid))?.username || null,
          display_name: profileMap.get(Number(m.sender_fid))?.display_name || null,
          pfp_url: profileMap.get(Number(m.sender_fid))?.pfp_url || null,
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
    console.error("[buddy-up/games/[id]/groups/[groupId]/chat GET]", e);
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
    const groups = await pokerDb.fetch<{ id: string; round_id: string; status: string }>("buddy_up_groups", {
      filters: { id: groupId },
      limit: 1,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const group = groups[0];
    const rounds = await pokerDb.fetch<{ id: string; game_id: string; status: string }>("buddy_up_rounds", {
      filters: { id: group.round_id },
      limit: 1,
    });

    if (!rounds || rounds.length === 0 || rounds[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group does not belong to this game" }, { status: 400 });
    }

    // Verify game is in progress and round is active
    const games = await pokerDb.fetch<{ id: string; status: string }>("buddy_up_games", {
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
      "buddy_up_chat_messages",
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

    // OPTIMIZATION: Get sender profile from signups table (no Neynar call)
    const signups = await pokerDb.fetch<{
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("buddy_up_signups", {
      filters: { game_id: gameId, fid },
      limit: 1,
    });

    const profile = signups?.[0];
    const sender = {
      fid: Number(fid),
      username: profile?.username || null,
      display_name: profile?.display_name || null,
      pfp_url: profile?.pfp_url || null,
    };

    const newId = (inserted[0] as unknown as { id: string }).id;
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        id: newId,
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
    console.error("[buddy-up/games/[id]/groups/[groupId]/chat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to send message" }, { status: 500 });
  }
}
