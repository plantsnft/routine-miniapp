/**
 * Phase 43: User Feedback
 * POST /api/feedback - Create ticket (message + up to 5 images, 25 MB each)
 * GET /api/feedback - List current user's tickets
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { uploadFeedbackImage } from "~/lib/feedback-storage";
import type { ApiResponse } from "~/lib/types";
import { randomUUID } from "crypto";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGES = 5;

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Use multipart/form-data with message and images." },
        { status: 400 }
      );
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid form data." }, { status: 400 });
    }

    const message = typeof form.get("message") === "string" ? form.get("message") as string : "";
    if (!message.trim()) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Message is required." }, { status: 400 });
    }

    const images: { file: File; index: number }[] = [];
    for (let i = 0; i < MAX_IMAGES; i++) {
      const f = form.get(`image${i}`);
      if (f instanceof File && f.size > 0) {
        images.push({ file: f, index: i });
      }
    }

    const ticketId = randomUUID();
    await pokerDb.insert("feedback_tickets", [
      {
        id: ticketId,
        fid,
        message: message.trim(),
        status: "open",
      },
    ]);

    if (images.length > 0) {
      const imageRows: { id: string; ticket_id: string; image_url: string }[] = [];
      for (const { file, index } of images) {
        const buf = Buffer.from(await file.arrayBuffer());
        if (buf.length > MAX_IMAGE_BYTES) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: `Image ${index + 1} too large (max 25 MB).` },
            { status: 400 }
          );
        }
        const contentType = file.type || "image/jpeg";
        const imageUrl = await uploadFeedbackImage(ticketId, index, buf, contentType);
        imageRows.push({
          id: randomUUID(),
          ticket_id: ticketId,
          image_url: imageUrl,
        });
      }
      await pokerDb.insert("feedback_images", imageRows);
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { ticketId, message: "Feedback submitted." },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[feedback POST]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to submit feedback" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const tickets = await pokerDb.fetch<{
      id: string;
      fid: number;
      message: string;
      status: string;
      created_at: string;
    }>("feedback_tickets", {
      filters: { fid },
      order: "created_at.desc",
      limit: 50,
    });

    if (!tickets || tickets.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: true, data: { tickets: [] } });
    }

    const replyCounts: Record<string, number> = {};
    const latestReplyByTicket: Record<string, string> = {};
    for (const t of tickets) {
      const replies = await pokerDb.fetch<{ created_at: string }>("feedback_replies", {
        filters: { ticket_id: t.id },
        select: "created_at",
        order: "created_at.desc",
        limit: 1,
      });
      const allReplies = await pokerDb.fetch<{ id: string }>("feedback_replies", {
        filters: { ticket_id: t.id },
      });
      replyCounts[t.id] = allReplies?.length ?? 0;
      latestReplyByTicket[t.id] = replies?.[0]?.created_at ?? t.created_at;
    }

    const imagesByTicket: Record<string, string[]> = {};
    for (const t of tickets) {
      const imgs = await pokerDb.fetch<{ image_url: string }>("feedback_images", {
        filters: { ticket_id: t.id },
        order: "created_at.asc",
      });
      imagesByTicket[t.id] = (imgs ?? []).map((i) => i.image_url);
    }

    const result = tickets.map((t) => ({
      id: t.id,
      message: t.message,
      status: t.status,
      created_at: t.created_at,
      reply_count: replyCounts[t.id] ?? 0,
      latest_reply_at: latestReplyByTicket[t.id],
      images: imagesByTicket[t.id] ?? [],
    }));

    return NextResponse.json<ApiResponse>({ ok: true, data: { tickets: result } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[feedback GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}
