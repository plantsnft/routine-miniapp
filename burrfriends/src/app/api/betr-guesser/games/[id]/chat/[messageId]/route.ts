/**
 * DELETE /api/betr-guesser/games/[id]/chat/[messageId] - Admin delete message
 * Phase 13.10.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId, messageId } = await params;

    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const messages = await pokerDb.fetch<{ id: string; game_id: string }>("betr_guesser_game_chat_messages", {
      filters: { id: messageId },
      limit: 1,
    });
    if (!messages || messages.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message not found" }, { status: 404 });
    }
    if (messages[0].game_id !== gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message not found" }, { status: 404 });
    }

    await pokerDb.delete("betr_guesser_game_chat_messages", { id: messageId });

    return NextResponse.json<ApiResponse>({ ok: true, data: { deleted: true } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[betr-guesser/games/[id]/chat/[messageId] DELETE]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to delete message" }, { status: 500 });
  }
}
