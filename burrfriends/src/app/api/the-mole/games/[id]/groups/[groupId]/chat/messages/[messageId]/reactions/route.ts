/**
 * POST /api/the-mole/games/[id]/groups/[groupId]/chat/messages/[messageId]/reactions
 * Set, change, or remove the current user's reaction on a message. Same access as group chat.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const VALID_REACTIONS = ['thumbs_up', 'x', 'fire', 'scream'] as const;

async function canAccessGroupChat(fid: number, groupId: string): Promise<boolean> {
  if (isAdmin(fid)) return true;
  const groups = await pokerDb.fetch<{ fids: number[] }>("mole_groups", {
    filters: { id: groupId },
    limit: 1,
  });
  if (!groups || groups.length === 0) return false;
  return (groups[0].fids || []).includes(Number(fid));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string; messageId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { groupId, messageId } = await params;
    const body = await req.json().catch(() => ({}));
    const reaction = typeof body.reaction === "string" ? body.reaction : "";

    if (!VALID_REACTIONS.includes(reaction as typeof VALID_REACTIONS[number])) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid reaction" }, { status: 400 });
    }

    const hasAccess = await canAccessGroupChat(fid, groupId);
    if (!hasAccess) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "You don't have access to this group's chat" }, { status: 403 });
    }

    const messages = await pokerDb.fetch<{ id: string; group_id: string }>("mole_chat_messages", {
      filters: { id: messageId },
      limit: 1,
    });
    if (!messages || messages.length === 0 || messages[0].group_id !== groupId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message not found" }, { status: 404 });
    }

    const existing = await pokerDb.fetch<{ reaction: string }>("mole_chat_reactions", {
      filters: { message_id: messageId, fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      if (existing[0].reaction === reaction) {
        await pokerDb.delete("mole_chat_reactions", { message_id: messageId, fid });
        return NextResponse.json<ApiResponse>({
          ok: true,
          data: { reaction: null, counts: await getCounts(messageId) },
        });
      }
      await pokerDb.delete("mole_chat_reactions", { message_id: messageId, fid });
    }

    await pokerDb.insert("mole_chat_reactions", [
      { message_id: messageId, fid, reaction },
    ]);

    const counts = await getCounts(messageId);
    return NextResponse.json<ApiResponse>({ ok: true, data: { reaction, counts } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[the-mole/chat/messages/[messageId]/reactions POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to set reaction" }, { status: 500 });
  }
}

async function getCounts(messageId: string): Promise<{ thumbs_up: number; x: number; fire: number; scream: number }> {
  const rows = await pokerDb.fetch<{ reaction: string }>("mole_chat_reactions", {
    filters: { message_id: messageId },
    limit: 500,
  });
  const counts = { thumbs_up: 0, x: 0, fire: 0, scream: 0 };
  for (const r of rows || []) {
    if (r.reaction in counts) (counts as Record<string, number>)[r.reaction]++;
  }
  return counts;
}
