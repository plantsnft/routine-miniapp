/**
 * GET/POST /api/admin/notification-prefs
 * Get or update admin's notification preferences
 * 
 * Phase 18: Admin Dashboard
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

    const prefs = await pokerDb.fetch<{
      fid: number;
      notify_ready_to_settle: boolean;
    }>("admin_notification_prefs", {
      filters: { fid },
      limit: 1,
    });

    if (!prefs || prefs.length === 0) {
      // Return defaults
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          notifyReadyToSettle: false,
        },
      });
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        notifyReadyToSettle: prefs[0].notify_ready_to_settle,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/notification-prefs GET]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get notification prefs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const notifyReadyToSettle = Boolean(body.notifyReadyToSettle);

    const now = new Date().toISOString();

    // Check if record exists
    const existing = await pokerDb.fetch<{ fid: number }>("admin_notification_prefs", {
      filters: { fid },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      // Update
      await pokerDb.update("admin_notification_prefs", { fid }, {
        notify_ready_to_settle: notifyReadyToSettle,
        updated_at: now,
      });
    } else {
      // Insert
      await pokerDb.insert("admin_notification_prefs", [{
        fid,
        notify_ready_to_settle: notifyReadyToSettle,
        created_at: now,
        updated_at: now,
      }]);
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        notifyReadyToSettle,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/notification-prefs POST]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to update notification prefs" },
      { status: 500 }
    );
  }
}
