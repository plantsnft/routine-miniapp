/**
 * GET /api/kill-or-keep/games/[id]/chat - Get game-level chat messages
 * POST /api/kill-or-keep/games/[id]/chat - Send message
 * Access: in turn_order_fids / remaining_fids / eliminated_fids or admin. Phase 38.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

async function canAccessGameChat(fid: number, gameId: string, req: NextRequest): Promise<boolean> {
  if (isAdmin(fid)) return true;
  const games = await pokerDb.fetch<{ id: string; is_preview?: boolean; turn_order_fids: number[]; remaining_fids: number[]; eliminated_fids: number[] }>("kill_or_keep_games", {
    filters: { id: gameId },
    limit: 1,
  });
  if (!games || games.length === 0) return false;
  if (canPlayPreviewGame(fid, games[0].is_preview, req)) return true;
  const order = (games[0].turn_order_fids || []).map((f: unknown) => Number(f)) as number[];
  const remaining = (games[0].remaining_fids || []).map((f: unknown) => Number(f)) as number[];
  const eliminated = (games[0].eliminated_fids || []).map((f: unknown) => Number(f)) as number[];
  return order.includes(fid) || remaining.includes(fid) || eliminated.includes(fid);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const hasAccess = await canAccessGameChat(fid, gameId, req);
    if (!hasAccess) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You don't have access to this game's chat" }, { status: 403 });
    }

    const messages = await pokerDb.fetch<{ id: string; game_id: string; fid: number; message: string; created_at: string }>(
      "kill_or_keep_chat_messages",
      { filters: { game_id: gameId }, limit: 100, order: "created_at.desc" }
    );

    const sorted = (messages || []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const uniqueFids = [...new Set(sorted.map((m) => Number(m.fid)))];
    const profiles: Record<number, { username: string; display_name: string; pfp_url: string }> = {};
    if (uniqueFids.length > 0) {
      try {
        const client = getNeynarClient();
        for (let i = 0; i < uniqueFids.length; i += 100) {
          const batch = uniqueFids.slice(i, i + 100);
          const response = await client.fetchBulkUsers({ fids: batch });
          for (const user of response.users || []) {
            profiles[user.fid] = {
              username: user.username || `fid:${user.fid}`,
              display_name: user.display_name || user.username || `FID ${user.fid}`,
              pfp_url: user.pfp_url || "",
            };
          }
        }
      } catch {
        // Profiles optional
      }
    }

    const messageIds = sorted.map((m) => m.id);
    const reactionsList = messageIds.length > 0
      ? await pokerDb.fetch<{ message_id: string; fid: number; reaction: string }>("kill_or_keep_chat_reactions", {
          filters: { message_id_in: messageIds },
          limit: 2000,
        })
      : [];
    const reactionCountsByMessage = new Map<string, { thumbs_up: number; x: number; fire: number; scream: number }>();
    const myReactionByMessage = new Map<string, string>();
    for (const m of sorted) {
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
      data: sorted.map((m) => {
        const fidNum = Number(m.fid);
        const p = profiles[fidNum];
        return {
          id: m.id,
          senderFid: fidNum,
          fid: fidNum,
          message: m.message,
          createdAt: m.created_at,
          sender: {
            fid: fidNum,
            username: p?.username ?? `fid:${fidNum}`,
            display_name: p?.display_name ?? `FID ${fidNum}`,
            pfp_url: p?.pfp_url ?? "",
          },
          reactions: reactionCountsByMessage.get(m.id) ?? { thumbs_up: 0, x: 0, fire: 0, scream: 0 },
          myReaction: myReactionByMessage.get(m.id) ?? null,
        };
      }),
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/chat GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch chat" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message || message.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message cannot be empty" }, { status: 400 });
    }
    if (message.length > 1000) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message must be 1000 characters or less" }, { status: 400 });
    }

    const hasAccess = await canAccessGameChat(fid, gameId, req);
    if (!hasAccess) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You don't have access to this game's chat" }, { status: 403 });
    }

    const games = await pokerDb.fetch<{ id: string; status: string }>("kill_or_keep_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }
    if (games[0].status !== "open" && games[0].status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Chat is only available while game is open or in progress" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const inserted = await pokerDb.insert(
      "kill_or_keep_chat_messages",
      [{ game_id: gameId, fid: Number(fid), message, created_at: now }]
    );

    if (!inserted || inserted.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to send message" }, { status: 500 });
    }

    const row = inserted[0] as unknown as { id: string };
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { id: row.id, fid: Number(fid), message, createdAt: now },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/chat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to send message" }, { status: 500 });
  }
}
