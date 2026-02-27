/**
 * Phase 43: User Feedback
 * POST /api/feedback/[id]/replies - Add admin reply; send push to submitter
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { sendNotificationToFid } from "~/lib/notifications";
import { APP_URL } from "~/lib/constants";
import type { ApiResponse } from "~/lib/types";
import { randomUUID } from "crypto";

const MAX_BODY_LENGTH = 128;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message is required." }, { status: 400 });
    }

    const tickets = await pokerDb.fetch<{ id: string; fid: number }>("feedback_tickets", {
      filters: { id },
      limit: 1,
    });
    const ticket = tickets?.[0];
    if (!ticket) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Ticket not found." }, { status: 404 });
    }

    const replyId = randomUUID();
    await pokerDb.insert("feedback_replies", [
      {
        id: replyId,
        ticket_id: id,
        fid,
        message,
      },
    ]);

    const submitterFid = ticket.fid;
    if (submitterFid !== fid) {
      const truncated = message.length > MAX_BODY_LENGTH ? message.slice(0, MAX_BODY_LENGTH - 3) + "..." : message;
      try {
        await sendNotificationToFid(
          submitterFid,
          {
            title: "Feedback reply",
            body: truncated,
            targetUrl: `${APP_URL}/clubs/burrfriends/games?feedback=${id}`,
          },
          `feedback-reply:${id}:${replyId}`
        );
      } catch (notifyErr) {
        console.warn("[feedback reply] Push notification failed:", notifyErr);
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        id: replyId,
        message,
        created_at: new Date().toISOString(),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[feedback/[id]/replies POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to add reply" },
      { status: 500 }
    );
  }
}
