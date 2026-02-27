/**
 * POST /api/bullied/games/[id]/groups/[groupId]/chat/heartbeat
 *
 * Updates presence for the current user in this group's chat.
 * Access: user must be in group OR admin. Group must belong to this game.
 * Call on mount and every 30s while viewing this group's chat.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
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

export async function POST(
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

    const groups = await pokerDb.fetch<{ id: string; round_id: string }>("bullied_groups", {
      filters: { id: groupId },
      limit: 1,
    });
    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }
    const rounds = await pokerDb.fetch<{ id: string; game_id: string }>("bullied_rounds", {
      filters: { id: groups[0].round_id },
      limit: 1,
    });
    if (!rounds || rounds.length === 0 || rounds[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group does not belong to this game" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await pokerDb.upsert("bullied_chat_presence", [
      { fid: Number(fid), group_id: groupId, last_seen_at: now },
    ]);

    return NextResponse.json<ApiResponse>({ ok: true, data: { last_seen_at: now } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[bullied/games/[id]/groups/[groupId]/chat/heartbeat POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to update presence" }, { status: 500 });
  }
}
