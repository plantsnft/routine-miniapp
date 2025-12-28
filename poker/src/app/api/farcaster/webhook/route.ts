/**
 * POST /api/farcaster/webhook
 * Receives Farcaster Mini App events (miniapp_added, notifications_enabled, etc.)
 * 
 * Handles notification token/URL storage for push notifications.
 * Events are verified using @farcaster/miniapp-node signature verification.
 * 
 * IMPORTANT: Always returns 200 to prevent retries, but only stores tokens if verification succeeds.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/miniapp-node";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/farcaster/webhook',
    method: 'GET',
  });
}

export async function POST(request: NextRequest) {
  let fid: number | null = null;
  let eventType: string | null = null;

  try {
    const requestJson = await request.json();

    // Verify event signature using Neynar app key verification
    // IMPORTANT: Only store tokens if verification succeeds
    let data;
    try {
      data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
    } catch (e: unknown) {
      const error = e as ParseWebhookEvent.ErrorType;

      // Log verification failure for diagnostics
      safeLog('error', '[farcaster/webhook] Event verification failed', {
        errorName: error.name,
        errorMessage: error.message,
      });

      // Return 200 to prevent retries, but do NOT store tokens
      switch (error.name) {
        case "VerifyJsonFarcasterSignature.InvalidDataError":
        case "VerifyJsonFarcasterSignature.InvalidEventDataError":
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 200 } // Return 200 to prevent retries
          );
        case "VerifyJsonFarcasterSignature.InvalidAppKeyError":
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 200 } // Return 200 to prevent retries
          );
        case "VerifyJsonFarcasterSignature.VerifyAppKeyError":
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 200 } // Return 200 to prevent retries
          );
        default:
          return NextResponse.json(
            { success: false, error: "Unknown verification error" },
            { status: 200 } // Return 200 to prevent retries
          );
      }
    }

    // Verification succeeded - extract data
    fid = data.fid;
    const event = data.event;
    eventType = event.event;

    // Type guard: only some event types have notificationDetails
    const hasNotificationDetails =
      "notificationDetails" in event && !!event.notificationDetails;

    safeLog('info', '[farcaster/webhook] Event received and verified', {
      fid,
      eventType: event.event,
      hasNotificationDetails,
    });

    // Only process and store tokens if verification succeeded
    try {
      // Handle different event types
      switch (event.event) {
        case "miniapp_added":
          // Type guard: check if notificationDetails exists on this event type
          if ("notificationDetails" in event && event.notificationDetails) {
            // User added the mini app and enabled notifications
            const notificationDetails = event.notificationDetails;
            await upsertSubscription(fid, {
              miniapp_added: true,
              enabled: true,
              token: notificationDetails.token,
              url: notificationDetails.url,
            });
            safeLog('info', '[farcaster/webhook] Mini app added with notifications - token stored', {
              fid,
              notificationUrl: notificationDetails.url,
            });
          } else {
            // Mini app added but no notification details - mark as added but don't enable notifications
            await upsertSubscription(fid, {
              miniapp_added: true,
              enabled: false,
              token: null,
              url: null,
            });
            safeLog('info', '[farcaster/webhook] Mini app added without notifications', { fid });
          }
          break;

        case "notifications_enabled":
          // Type guard: check if notificationDetails exists on this event type
          if ("notificationDetails" in event && event.notificationDetails) {
            // User enabled notifications (new token/URL)
            // INVARIANT: enabled=true requires token and url (CHECK constraint enforces this)
            const notificationDetails = event.notificationDetails;
            await upsertSubscription(fid, {
              miniapp_added: true,
              enabled: true,
              token: notificationDetails.token,
              url: notificationDetails.url,
            });
            safeLog('info', '[farcaster/webhook] Notifications enabled - token stored', {
              fid,
              notificationUrl: notificationDetails.url,
            });
          } else {
            safeLog('warn', '[farcaster/webhook] notifications_enabled event missing notificationDetails', { fid });
          }
          break;

        case "notifications_disabled":
          // Disable notifications but keep miniapp_added=true
          await disableNotifications(fid);
          safeLog('info', '[farcaster/webhook] Notifications disabled for all subscriptions', { fid });
          break;

        case "miniapp_removed":
          // Remove mini app - clear all subscription data
          await removeMiniApp(fid);
          safeLog('info', '[farcaster/webhook] Mini app removed - subscriptions cleared', { fid });
          break;

        default:
          safeLog('warn', '[farcaster/webhook] Unknown event type (ignored)', {
            fid,
            eventType: eventType || 'unknown',
          });
      }

      // Always return 200 on success
      return NextResponse.json({ success: true });
    } catch (dbError: any) {
      // Log database errors but return 200 (webhook should not retry on our DB errors)
      safeLog('error', '[farcaster/webhook] Database error processing event', {
        fid,
        eventType,
        error: dbError?.message || String(dbError),
      });
      return NextResponse.json({ success: true }); // Return 200 to prevent webhook retries
    }
  } catch (error: any) {
    // Log unexpected errors (but don't expose details)
    safeLog('error', '[farcaster/webhook] Unexpected error', {
      fid: fid || 'unknown',
      eventType: eventType || 'unknown',
      error: error?.message || String(error),
    });
    // Return 200 to prevent webhook retries for unexpected errors
    return NextResponse.json({ success: true });
  }
}

/**
 * Upsert notification subscription for a user
 * Uses new schema with separate token and notification_url columns
 * Handles multiple tokens per FID (different clients/apps can have different tokens)
 * Now also tracks miniapp_added state
 */
async function upsertSubscription(
  fid: number,
  data: { miniapp_added: boolean; enabled: boolean; token: string | null; url: string | null }
): Promise<void> {
  try {
    // If we have a token and URL, check for existing subscription by (fid, url, token)
    // If no token/URL, we need to find existing by fid only (for miniapp_added tracking)
    let existing: any[] = [];
    
    if (data.token && data.url) {
      // Look for exact match (fid + url + token)
      existing = await pokerDb.fetch<any>('notification_subscriptions', {
        filters: {
          fid: fid,
          notification_url: data.url,
          token: data.token,
        },
        limit: 1,
      });
    } else {
      // No token/URL - look for any subscription for this FID to update miniapp_added
      // Prefer finding one with NULL token/url if multiple exist
      const allForFid = await pokerDb.fetch<any>('notification_subscriptions', {
        filters: { fid: fid },
      });
      // Prefer one with NULL token (for miniapp_added tracking), otherwise any one
      existing = allForFid.filter((sub: any) => !sub.token && !sub.notification_url);
      if (existing.length === 0 && allForFid.length > 0) {
        existing = [allForFid[0]];
      }
    }

    // INVARIANT: enabled=true requires token and notification_url (CHECK constraint enforces this)
    // Defensive check: never set enabled=true without token/url
    if (data.enabled && (!data.token || !data.url)) {
      throw new Error('Cannot set enabled=true without token and notification_url');
    }

    const updateData: any = {
      miniapp_added: data.miniapp_added,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    };

    // Only update token/url if provided (not null)
    if (data.token && data.url) {
      updateData.notification_url = data.url;
      updateData.token = data.token;
    } else if (data.token === null && data.url === null) {
      // Explicitly clear token/url if both are null
      updateData.notification_url = null;
      updateData.token = null;
    }

    if (existing && existing.length > 0) {
      // Update existing subscription
      await pokerDb.update(
        'notification_subscriptions',
        { id: existing[0].id },
        updateData
      );
    } else {
      // Insert new subscription
      // token and url can be null (for miniapp_added without notifications enabled)
      // INVARIANT: enabled=true requires token and notification_url (CHECK constraint enforces this)
      // Defensive check already done above
      const insertData: any = {
        fid,
        miniapp_added: data.miniapp_added,
        enabled: data.enabled,
        provider: 'farcaster',
      };

      // Only set token/url if provided (can be null)
      if (data.token && data.url) {
        insertData.notification_url = data.url;
        insertData.token = data.token;
      } else {
        insertData.notification_url = null;
        insertData.token = null;
      }

      await pokerDb.insert('notification_subscriptions', insertData);
    }
  } catch (error: any) {
    // Re-throw to be caught by caller
    throw error;
  }
}

/**
 * Disable notifications but keep miniapp_added=true (for notifications_disabled event)
 */
async function disableNotifications(fid: number): Promise<void> {
  try {
    // Disable notifications but keep miniapp_added=true
    await pokerDb.update(
      'notification_subscriptions',
      { fid },
      {
        enabled: false,
        token: null,
        notification_url: null,
        updated_at: new Date().toISOString(),
      } as any
    );
    safeLog('info', '[farcaster/webhook] Disabled notifications for FID', { fid });
  } catch (error: any) {
    // Log but don't throw (non-critical)
    safeLog('warn', '[farcaster/webhook] Failed to disable notifications', {
      fid,
      error: error?.message || String(error),
    });
  }
}

/**
 * Remove mini app completely - clear all subscription data (for miniapp_removed event)
 */
async function removeMiniApp(fid: number): Promise<void> {
  try {
    // Clear all subscription data including miniapp_added
    await pokerDb.update(
      'notification_subscriptions',
      { fid },
      {
        miniapp_added: false,
        enabled: false,
        token: null,
        notification_url: null,
        updated_at: new Date().toISOString(),
      } as any
    );
    safeLog('info', '[farcaster/webhook] Removed mini app for FID', { fid });
  } catch (error: any) {
    // Log but don't throw (non-critical)
    safeLog('warn', '[farcaster/webhook] Failed to remove mini app', {
      fid,
      error: error?.message || String(error),
    });
  }
}
