/**
 * POST /api/notifications/subscribe
 * Subscribe a user to push notifications
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    const body = await req.json();
    const { provider = 'farcaster', payload = null } = body;

    // Upsert subscription (enable by default when subscribing)
    try {
      // Check if subscription exists
      const existing = await pokerDb.fetch<any>('notification_subscriptions', {
        filters: { fid },
        limit: 1,
      });

      // Note: With new schema, token/url come from webhook, not here
      // This endpoint only sets enabled=true (token/url stored via webhook)
      if (existing && existing.length > 0) {
        // Update existing subscription(s) to enabled (may have multiple tokens per fid)
        await pokerDb.update(
          'notification_subscriptions',
          { fid },
          {
            enabled: true,
            updated_at: new Date().toISOString(),
          } as any
        );
      } else {
        // No subscription exists yet - user needs to add mini app first (webhook will create record)
        // We can't create a subscription without token/url (those come from webhook)
        safeLog('info', '[notifications/subscribe] No subscription found - user must add mini app first', { fid });
      }

      safeLog('info', '[notifications/subscribe] User subscribed', { fid, provider });

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { subscribed: true, fid, provider },
      });
    } catch (dbError: any) {
      safeLog('error', '[notifications/subscribe] Failed to store subscription', {
        fid,
        error: dbError?.message || String(dbError),
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Failed to subscribe to notifications' },
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

    safeLog('error', '[notifications/subscribe] Error', {
      error: error?.message || String(error),
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to subscribe to notifications' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/subscribe
 * Unsubscribe a user from push notifications
 */
export async function DELETE(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    try {
      // Update subscription to disabled (don't delete to keep history)
      await pokerDb.update(
        'notification_subscriptions',
        { fid },
        {
          enabled: false,
          updated_at: new Date().toISOString(),
        } as any
      );

      safeLog('info', '[notifications/subscribe] User unsubscribed', { fid });

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { subscribed: false, fid },
      });
    } catch (dbError: any) {
      safeLog('error', '[notifications/subscribe] Failed to unsubscribe', {
        fid,
        error: dbError?.message || String(dbError),
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Failed to unsubscribe from notifications' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[notifications/subscribe] Error', {
      error: error?.message || String(error),
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to unsubscribe from notifications' },
      { status: 500 }
    );
  }
}

