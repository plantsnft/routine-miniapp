/**
 * POST /api/notifications/broadcast
 * Admin-only endpoint to broadcast push notifications to all enabled subscribers
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * ADMIN ONLY: Requires FID to be in NOTIFICATIONS_BROADCAST_ADMIN_FIDS env var
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { sendBulkNotifications, generateNotificationId } from "~/lib/notifications";
import { pokerDb } from "~/lib/pokerDb";
import { APP_URL } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

const ENABLE_NOTIFICATIONS = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';

/**
 * Helper function to get eligible FIDs based on filters
 * Reused by both GET (preview) and POST (actual send) endpoints
 */
async function getEligibleFids(
  stakingMinAmount: number | null | undefined,
  participationFilter: string | null | undefined
): Promise<number[]> {
  // Fetch all enabled subscribers with valid tokens
  const allSubscriptions = await pokerDb.fetch<any>('notification_subscriptions', {
    filters: { enabled: true },
    select: 'id,fid,enabled,notification_url,token,provider',
  });

  // Filter to only subscriptions with valid tokens
  const validSubscriptions = allSubscriptions.filter((sub: any) => {
    return sub.token && typeof sub.token === 'string' && sub.token.trim().length > 0 && sub.notification_url;
  });

  // Phase 5: Filter by staking requirement (if provided)
  let audienceFids: number[] = [];
  if (stakingMinAmount && stakingMinAmount > 0) {
    const { checkUserStakeByFid } = await import('~/lib/staking');
    
    // Check each subscriber's stake and filter to only those meeting the requirement
    for (const sub of validSubscriptions) {
      try {
        const stakeCheck = await checkUserStakeByFid(sub.fid, Number(stakingMinAmount));
        if (stakeCheck.meetsRequirement) {
          audienceFids.push(sub.fid);
        }
      } catch (stakeError: any) {
        // Log but continue - one stake check failure shouldn't block the broadcast
        safeLog('warn', '[notifications/broadcast] Failed to check stake for subscriber', {
          fid: sub.fid,
          error: stakeError?.message || 'Unknown error',
        });
      }
    }
  } else {
    // No staking requirement - start with all valid subscribers
    audienceFids = validSubscriptions.map((sub: any) => sub.fid);
  }

  // Phase 8.2: Filter by game participation (if provided)
  if (participationFilter && participationFilter !== 'all') {
    // Get all participants to filter by participation
    const allParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
      select: 'fid,inserted_at',
    });

    const now = Date.now();
    let participantFids: Set<number>;

    if (participationFilter === 'recent') {
      // Recent players: played in last 30 days
      const cutoffDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      participantFids = new Set(
        allParticipants
          .filter((p: any) => p.inserted_at && new Date(p.inserted_at) >= new Date(cutoffDate))
          .map((p: any) => Number(p.fid))
      );
    } else if (participationFilter === 'active') {
      // Active players: played in last 7 days
      const cutoffDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      participantFids = new Set(
        allParticipants
          .filter((p: any) => p.inserted_at && new Date(p.inserted_at) >= new Date(cutoffDate))
          .map((p: any) => Number(p.fid))
      );
    } else if (participationFilter === 'never') {
      // Never played: subscribers who have never participated
      // Get all unique FIDs that have ever participated
      const allParticipantFids = new Set(
        allParticipants.map((p: any) => Number(p.fid))
      );
      // Keep only FIDs from audienceFids that are NOT in participants
      // For 'never', we directly return the filtered list
      return audienceFids.filter(fid => !allParticipantFids.has(fid));
    } else {
      // Unknown filter - return all
      return audienceFids;
    }

    // Intersect with existing audienceFids (for 'recent' and 'active')
    audienceFids = audienceFids.filter(fid => participantFids.has(fid));
  }

  return audienceFids;
}

/**
 * GET /api/notifications/broadcast/preview
 * Preview endpoint to get count of eligible users without sending
 * Phase 8.1: Preview count feature
 */
export async function GET(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // ADMIN CHECK: Use isAdmin() which checks both isGlobalAdmin and NOTIFICATIONS_BROADCAST_ADMIN_FIDS
    if (!isAdmin(fid)) {
      safeLog('warn', '[notifications/broadcast/preview] Unauthorized access attempt', { fid });
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

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const stakingMinAmountParam = searchParams.get('stakingMinAmount');
    const participationFilterParam = searchParams.get('participationFilter');

    const stakingMinAmount = stakingMinAmountParam ? parseFloat(stakingMinAmountParam) : null;
    const participationFilter = participationFilterParam || null;

    // Get eligible FIDs (reuse filtering logic)
    const eligibleFids = await getEligibleFids(stakingMinAmount, participationFilter);

    safeLog('info', '[notifications/broadcast/preview] Preview count calculated', {
      adminFid: fid,
      stakingMinAmount: stakingMinAmount || null,
      participationFilter: participationFilter || 'all',
      eligibleCount: eligibleFids.length,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { count: eligibleFids.length },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[notifications/broadcast/preview] Error', {
      error: error?.message || String(error),
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to get preview count' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // ADMIN CHECK: Use isAdmin() which checks both isGlobalAdmin and NOTIFICATIONS_BROADCAST_ADMIN_FIDS
    if (!isAdmin(fid)) {
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
    const { title, body: bodyText, targetUrl, stakingMinAmount, participationFilter } = body;

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

    // Phase 8: Get eligible FIDs using shared filtering logic
    const audienceFids = await getEligibleFids(stakingMinAmount, participationFilter);

    safeLog('info', '[notifications/broadcast] Filtered audience', {
      adminFid: fid,
      stakingMinAmount: stakingMinAmount || null,
      participationFilter: participationFilter || 'all',
      audienceCount: audienceFids.length,
    });

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

    // Log broadcast to admin_broadcasts table (Phase 18.1)
    try {
      await pokerDb.insert('admin_broadcasts', [{
        admin_fid: fid,
        title: title.trim(),
        body: bodyText.trim(),
        target_url: finalTargetUrl || null,
        staking_min_amount: stakingMinAmount || null,
        participation_filter: participationFilter || null,
        recipients_count: successCount,
        sent_at: new Date().toISOString(),
      }]);
    } catch (logError) {
      // Don't fail the request if logging fails
      safeLog('warn', '[notifications/broadcast] Failed to log broadcast to history', {
        error: (logError as Error)?.message || String(logError),
      });
    }

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
