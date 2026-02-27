/**
 * GET /api/admin/broadcast-history
 * Returns past broadcasts from admin_broadcasts table
 * 
 * Phase 18.1: Admin Dashboard v2
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
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const broadcasts = await pokerDb.fetch<{
      id: string;
      admin_fid: number;
      title: string;
      body: string;
      target_url: string | null;
      staking_min_amount: number | null;
      participation_filter: string | null;
      recipients_count: number;
      sent_at: string;
    }>("admin_broadcasts", {
      select: "id,admin_fid,title,body,target_url,staking_min_amount,participation_filter,recipients_count,sent_at",
      order: "sent_at.desc",
      limit: 50,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { broadcasts: broadcasts || [] },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/broadcast-history]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get broadcast history" },
      { status: 500 }
    );
  }
}
