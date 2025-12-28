/**
 * POST /api/notifications/broadcast
 * Admin-only endpoint to broadcast push notifications to all enabled subscribers
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * ADMIN ONLY: Requires FID to be in NOTIFICATIONS_BROADCAST_ADMIN_FIDS env var
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { sendBulkNotifications, generateNotificationId } from "~/lib/notifications";
import { pokerDb } from "~/lib/pokerDb";
import { APP_URL, NOTIFICATIONS_BROADCAST_ADMIN_FIDS } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

const ENABLE_NOTIFICATIONS = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/notifications/broadcast',
    method: 'GET',
  });
}

export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // ADMIN CHECK: Only allow FIDs in NOTIFICATIONS_BROADCAST_ADMIN_FIDS
    if (!NOTIFICATIONS_BROADCAST_ADMIN_FIDS.includes(fid)) {
      safeLog('warn', '[notifications/broadcast] Unauthorized access attempt', { fid });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }

    // Check feature flag
    if (!ENABLE_NOTIFICATIONS) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Push notifications are disabled' },
        { status: 503 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { title, body: bodyText, targetUrl } = body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'title is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!bodyText || typeof bodyText !== 'string' || bodyText.trim().length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'body is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate lengths (Farcaster spec constraints)
    if (title.length > 32) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'title must be <= 32 characters' },
        { status: 400 }
      );
    }

    if (bodyText.length > 128) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'body must be <= 128 characters' },
        { status: 400 }
      );
    }

    // Process targetUrl: convert to absolute if relative
    let finalTargetUrl = targetUrl || `${APP_URL}/clubs`;
    if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      // Relative URL - make it absolute
      finalTargetUrl = new URL(targetUrl, APP_URL).href;
    }

    // Fetch all enabled subscribers with valid tokens
    // Query all subscriptions where enabled=true
    // INVARIANT: enabled=true requires token and notification_url (CHECK constraint enforces this at DB level)
    // This client-side filter is a safety check
    const allSubscriptions = await pokerDb.fetch<any>('notification_subscriptions', {
      filters: { enabled: true },
      select: 'id,fid,enabled,notification_url,token,provider',
    });

    // Filter to only subscriptions with valid tokens (token exists and is non-empty)
    // CHECK constraint ensures enabled=true -> token IS NOT NULL, but we validate here too
    const validSubscriptions = allSubscriptions.filter((sub: any) => {
      return sub.token && typeof sub.token === 'string' && sub.token.trim().length > 0 && sub.notification_url;
    });

    const audienceFids = validSubscriptions.map((sub: any) => sub.fid);

    safeLog('info', '[notifications/broadcast] Starting broadcast', {
      adminFid: fid,
      audienceCount: audienceFids.length,
      title: title.substring(0, 32),
    });

    // Generate stable notification ID for broadcast
    const notificationId = generateNotificationId('game_created', `broadcast-${Date.now()}`);

    // Send notifications to all subscribers
    const results = await sendBulkNotifications(
      audienceFids,
      {
        title: title.trim(),
        body: bodyText.trim(),
        targetUrl: finalTargetUrl,
      },
      notificationId
    );

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    safeLog('info', '[notifications/broadcast] Broadcast completed', {
      adminFid: fid,
      audienceCount: audienceFids.length,
      attempted: results.length,
      successCount,
      failedCount,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        adminFid: fid,
        audienceCount: audienceFids.length,
        attempted: results.length,
        successCount,
        failedCount,
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

    safeLog('error', '[notifications/broadcast] Error', {
      error: error?.message || String(error),
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to send broadcast' },
      { status: 500 }
    );
  }
}

