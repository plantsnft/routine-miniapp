/**
 * POST /api/notifications/test
 * Send a test push notification to the authenticated user only
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * Gate: Only allows HELLFIRE_OWNER_FID if configured (optional safety)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { sendBulkNotifications, generateNotificationId } from "~/lib/notifications";
import { HELLFIRE_OWNER_FID } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

const ENABLE_NOTIFICATIONS = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/notifications/test',
    method: 'GET',
  });
}

export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // Optional gate: only allow HELLFIRE_OWNER_FID if configured
    if (HELLFIRE_OWNER_FID !== null && fid !== HELLFIRE_OWNER_FID) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Test endpoint restricted to owner' },
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
    const notificationId = generateNotificationId('game_created', 'test');
    const results = await sendBulkNotifications(
      [fid],
      {
        title: 'Test Notification',
        body: 'This is a test push notification from Poker Lobby',
        targetUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://poker-swart.vercel.app'}/clubs`,
      },
      notificationId
    );

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const errorsSample = results
      .filter(r => !r.success && r.error)
      .slice(0, 3)
      .map(r => r.error);

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

    safeLog('error', '[notifications/test] Error', {
      error: error?.message || String(error),
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to send test notification' },
      { status: 500 }
    );
  }
}

