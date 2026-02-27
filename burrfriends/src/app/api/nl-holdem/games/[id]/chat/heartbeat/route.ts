/**
 * POST /api/nl-holdem/games/[id]/chat/heartbeat - Update presence; when inChat true set chat_last_seen_at
 * Phase 40.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

async function canAccessGameChat(fid: number, gameId: string, req: NextRequest): Promise<boolean> {
  if (isAdmin(fid)) return true;
  const games = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean; seat_order_fids?: number[] | null }>("nl_holdem_games", {
    filters: { id: gameId },
    limit: 1,
  });
  if (!games || games.length === 0) return false;
  if (canPlayPreviewGame(fid, games[0].is_preview, req)) return true;
  const seats = (games[0].seat_order_fids || []).map((f: unknown) => Number(f)) as number[];
  if (seats.length > 0) return seats.includes(fid);
  const signups = await pokerDb.fetch<{ fid: number }>("nl_holdem_signups", {
    filters: { game_id: gameId },
    select: "fid",
    limit: 20,
  });
  if ((signups || []).some((s) => Number(s.fid) === fid)) return true;
  if (games[0].status === "in_progress") return true;
  return false;
}

export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const inChat = Boolean(body.inChat);

    const now = new Date().toISOString();
    const existing = await pokerDb.fetch<{ game_id: string; fid: number }>("nl_holdem_chat_presence", {
      filters: { game_id: gameId, fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      if (inChat) {
        await pokerDb.update("nl_holdem_chat_presence", { game_id: gameId, fid }, { chat_last_seen_at: now });
      }
    } else {
      await pokerDb.insert("nl_holdem_chat_presence", [
        { game_id: gameId, fid, chat_last_seen_at: inChat ? now : null },
      ]);
    }

    return NextResponse.json<ApiResponse>({ ok: true });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[nl-holdem/games/[id]/chat/heartbeat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to update presence" }, { status: 500 });
  }
}
