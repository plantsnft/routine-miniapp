/**
 * Phase 43: User Feedback
 * GET /api/admin/feedback - List all tickets (admin only, paginated)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 100);

    const tickets = await pokerDb.fetch<{
      id: string;
      fid: number;
      message: string;
      status: string;
      created_at: string;
    }>("feedback_tickets", {
      select: "id,fid,message,status,created_at",
      order: "created_at.desc",
      limit: limit + 1,
    });

    const all = tickets ?? [];
    const hasMore = all.length > limit;
    const page = all.slice(0, limit);

    const replyCounts: Record<string, number> = {};
    for (const t of page) {
      const replies = await pokerDb.fetch<{ id: string }>("feedback_replies", {
        filters: { ticket_id: t.id },
      });
      replyCounts[t.id] = replies?.length ?? 0;
    }

    const result = page.map((t) => ({
      id: t.id,
      fid: t.fid,
      message: t.message.length > 100 ? t.message.slice(0, 100) + "…" : t.message,
      status: t.status,
      created_at: t.created_at,
      reply_count: replyCounts[t.id] ?? 0,
    }));

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        tickets: result,
        hasMore,
        total: result.length,
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
    console.error("[admin/feedback GET]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}
