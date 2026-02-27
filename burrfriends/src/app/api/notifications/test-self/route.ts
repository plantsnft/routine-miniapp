/**
 * POST /api/notifications/test-self
 * Send a test push notification to the authenticated user (self)
 * 
 * ADMIN ONLY: Requires FID to be in NOTIFICATIONS_BROADCAST_ADMIN_FIDS env var
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * Still respects ENABLE_PUSH_NOTIFICATIONS feature flag
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { sendBulkNotifications, generateNotificationId } from "~/lib/notifications";
import { NOTIFICATIONS_BROADCAST_ADMIN_FIDS, APP_URL } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

const ENABLE_NOTIFICATIONS = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/notifications/test-self',
    method: 'GET',
  });
}

export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // ADMIN CHECK: Only allow FIDs in NOTIFICATIONS_BROADCAST_ADMIN_FIDS
    if (!NOTIFICATIONS_BROADCAST_ADMIN_FIDS.includes(fid)) {
      safeLog('warn', '[notifications/test-self] Unauthorized access attempt', { fid });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }

    if (!ENABLE_NOTIFICATIONS) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Push notifications are disabled' },
        { status: 503 }
      );
    }

    // Send test notification to authenticated user only
    const notificationId = generateNotificationId('game_created', 'test-self');
    const results = await sendBulkNotifications(
      [fid],
      {
        title: 'Test Notification',
        body: 'This is a test push notification from Poker Lobby',
        targetUrl: `${APP_URL}/clubs`,
      },
      notificationId
    );

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const errorsSample = results
      .filter(r => !r.success && r.error)
      .slice(0, 3)
      .map(r => r.error);

    safeLog('info', '[notifications/test-self] Test notification sent', {
      fid,
      successCount,
      failedCount,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        fid,
        attempted: results.length,
        successCount,
        failedCount,
        errorsSample: errorsSample.length > 0 ? errorsSample : undefined,
      },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[notifications/test-self] Error', {
      error: error?.message || String(error),
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to send test notification' },
      { status: 500 }
    );
  }
}
