/**
 * GET /api/notifications/status
 * Get notification subscription status for the authenticated user
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { NOTIFICATIONS_BROADCAST_ADMIN_FIDS } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    try {
      // Fetch ALL subscriptions for this user (Phase 22.4: need to check all rows for miniapp_added)
      const subscriptions = await pokerDb.fetch<any>('notification_subscriptions', {
        filters: { fid: fid },
        select: 'id,fid,enabled,notification_url,token,provider,miniapp_added',
        // No limit - need ALL rows to check if ANY has miniapp_added=true
      });

      // Check if user is admin (server-side source of truth)
      const isAdmin = NOTIFICATIONS_BROADCAST_ADMIN_FIDS.includes(fid);

      if (!subscriptions || subscriptions.length === 0) {
        return NextResponse.json<ApiResponse>({
          ok: true,
          data: {
            fid,
            enabled: false,
            hasToken: false,
            hasMiniAppAdded: false,
            isAdmin,
          },
        });
      }

      // Phase 22.4: Check if ANY subscription has miniapp_added=true (fixes multiple-row bug)
      const hasMiniAppAdded = subscriptions.some((sub: any) => sub.miniapp_added === true);

      // For token/enabled, prefer a subscription with a token (fall back to first row)
      const tokenSub = subscriptions.find((sub: any) => sub.token && sub.notification_url);
      const subscription = tokenSub || subscriptions[0];
      
      // Check if subscription has valid token/url (new schema: separate columns)
      const hasToken = !!(subscription.token && subscription.notification_url);

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          fid,
          enabled: subscription.enabled || false,
          hasToken,
          hasMiniAppAdded,
          isAdmin,
        },
      });
    } catch (dbError: any) {
      safeLog('error', '[notifications/status] Failed to fetch subscription', {
        fid,
        error: dbError?.message || String(dbError),
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Failed to fetch notification status' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[notifications/status] Error', {
      error: error?.message || String(error),
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to get notification status' },
      { status: 500 }
    );
  }
}

