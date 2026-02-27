/**
 * Phase 43: User Feedback
 * GET /api/feedback/[id] - Ticket detail (user: own only, admin: any)
 * PATCH /api/feedback/[id] - Update status (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id } = await params;

    const tickets = await pokerDb.fetch<{
      id: string;
      fid: number;
      message: string;
      status: string;
      created_at: string;
    }>("feedback_tickets", {
      filters: { id },
      limit: 1,
    });

    const ticket = tickets?.[0];
    if (!ticket) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Ticket not found." }, { status: 404 });
    }

    if (ticket.fid !== fid && !isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Access denied." }, { status: 403 });
    }

    const images = await pokerDb.fetch<{ image_url: string; created_at: string }>("feedback_images", {
      filters: { ticket_id: id },
      order: "created_at.asc",
    });

    const replies = await pokerDb.fetch<{
      id: string;
      fid: number;
      message: string;
      created_at: string;
    }>("feedback_replies", {
      filters: { ticket_id: id },
      order: "created_at.asc",
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        id: ticket.id,
        fid: ticket.fid,
        message: ticket.message,
        status: ticket.status,
        created_at: ticket.created_at,
        images: (images ?? []).map((i) => i.image_url),
        replies: (replies ?? []).map((r) => ({
          id: r.id,
          fid: r.fid,
          message: r.message,
          created_at: r.created_at,
        })),
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
    console.error("[feedback/[id] GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch ticket" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const status = typeof body.status === "string" ? body.status.trim() : "";
    if (status !== "open" && status !== "resolved") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "status must be 'open' or 'resolved'." },
        { status: 400 }
      );
    }

    const tickets = await pokerDb.fetch<{ id: string }>("feedback_tickets", {
      filters: { id },
      limit: 1,
    });
    if (!tickets?.length) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Ticket not found." }, { status: 404 });
    }

    await pokerDb.update("feedback_tickets", { id }, { status });

    return NextResponse.json<ApiResponse>({ ok: true, data: { status } });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[feedback/[id] PATCH]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to update ticket" },
      { status: 500 }
    );
  }
}
