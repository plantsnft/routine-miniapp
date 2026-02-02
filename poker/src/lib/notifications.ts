/**
 * Push notification utilities for Giveaway Games
 * 
 * Uses Farcaster Mini App native notification system:
 * - Sends notifications to stored URLs with tokens (from webhook events)
 * - Groups subscriptions by notification_url and batches tokens (max 100 per request)
 * - Handles invalidTokens and rateLimitedTokens from responses
 * - Enforces Farcaster spec constraints (title <= 32, body <= 128, etc.)
 * 
 * All notification sending is feature-flagged via ENABLE_PUSH_NOTIFICATIONS env var.
 */

import { APP_URL } from './constants';
import { pokerDb } from './pokerDb';
import { safeLog } from './redaction';

const ENABLE_NOTIFICATIONS = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';

// Farcaster spec constraints
const MAX_TITLE_LENGTH = 32;
const MAX_BODY_LENGTH = 128;
const MAX_NOTIFICATION_ID_LENGTH = 128;
const MAX_TOKENS_PER_REQUEST = 100;
const NOTIFICATION_TIMEOUT_MS = 5000; // 5 seconds per batch

export interface NotificationPayload {
  title: string;
  body: string;
  targetUrl: string; // Must be absolute URL
  data?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  error?: string;
  fid?: number;
}

interface Subscription {
  id: string;
  fid: number;
  enabled: boolean;
  notification_url: string;
  token: string;
  provider: string | null;
}

/**
 * Enforce Farcaster spec constraints on notification payload
 */
function enforceConstraints(payload: NotificationPayload, notificationId: string): {
  title: string;
  body: string;
  notificationId: string;
  targetUrl: string;
} {
  // Truncate title to max 32 chars
  const title = payload.title.length > MAX_TITLE_LENGTH
    ? payload.title.substring(0, MAX_TITLE_LENGTH)
    : payload.title;

  // Truncate body to max 128 chars
  const body = payload.body.length > MAX_BODY_LENGTH
    ? payload.body.substring(0, MAX_BODY_LENGTH)
    : payload.body;

  // Truncate notificationId to max 128 chars
  const trimmedNotificationId = notificationId.length > MAX_NOTIFICATION_ID_LENGTH
    ? notificationId.substring(0, MAX_NOTIFICATION_ID_LENGTH)
    : notificationId;

  // Ensure targetUrl is absolute (same domain as app)
  let targetUrl = payload.targetUrl;
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    // Make relative URL absolute
    targetUrl = new URL(targetUrl, APP_URL).href;
  }

  return { title, body, notificationId: trimmedNotificationId, targetUrl };
}

/**
 * Send notifications to subscriptions with timeout
 * Groups subscriptions by notification_url and batches tokens (max 100 per request)
 */
export async function sendNotificationsToSubscriptions(
  subscriptions: Subscription[],
  payload: NotificationPayload,
  notificationId: string
): Promise<NotificationResult[]> {
  if (!ENABLE_NOTIFICATIONS) {
    safeLog('info', '[notifications] Notifications disabled, skipping', {
      subscriptionCount: subscriptions.length,
    });
    return subscriptions.map(sub => ({
      success: false,
      error: 'Notifications disabled',
      fid: sub.fid,
    }));
  }

  if (subscriptions.length === 0) {
    return [];
  }

  // Enforce Farcaster spec constraints
  const { title, body, notificationId: trimmedNotificationId, targetUrl } = enforceConstraints(payload, notificationId);

  // Filter to only enabled subscriptions with valid token/url
  // INVARIANT: enabled=true requires token and notification_url (CHECK constraint enforces this at DB level)
  // This client-side filter is a safety check in case CHECK constraint is bypassed
  const validSubscriptions = subscriptions.filter(sub => {
    return sub.enabled && sub.notification_url && sub.token;
  });

  if (validSubscriptions.length === 0) {
    safeLog('info', '[notifications] No valid enabled subscriptions', {
      totalSubscriptions: subscriptions.length,
    });
    return subscriptions.map(sub => ({
      success: false,
      error: !sub.enabled ? 'disabled' : 'no valid token/url',
      fid: sub.fid,
    }));
  }

  // Group subscriptions by notification_url
  const subscriptionsByUrl = new Map<string, Subscription[]>();
  for (const sub of validSubscriptions) {
    const url = sub.notification_url;
    if (!subscriptionsByUrl.has(url)) {
      subscriptionsByUrl.set(url, []);
    }
    subscriptionsByUrl.get(url)!.push(sub);
  }

  const results: NotificationResult[] = [];

  // Send to each URL group
  for (const [url, urlSubscriptions] of subscriptionsByUrl.entries()) {
    // Batch tokens into chunks of 100 (Farcaster limit)
    for (let i = 0; i < urlSubscriptions.length; i += MAX_TOKENS_PER_REQUEST) {
      const batch = urlSubscriptions.slice(i, i + MAX_TOKENS_PER_REQUEST);
      const tokens = batch.map(sub => sub.token);

      try {
        // POST to the notification URL with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              notificationId: trimmedNotificationId,
              title,
              body,
              targetUrl,
              tokens,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            safeLog('error', '[notifications] Notification API returned error', {
              url,
              status: response.status,
              errorLength: errorText.length,
              tokenCount: tokens.length,
            });

            // Mark all in batch as failed
            for (const sub of batch) {
              results.push({
                success: false,
                error: `HTTP ${response.status}`,
                fid: sub.fid,
              });
            }
            continue;
          }

          // Handle 204 No Content or empty body as success (all tokens succeeded)
          if (response.status === 204) {
            safeLog('info', '[notifications] Batch sent (204 No Content) - all tokens successful', {
              url,
              tokenCount: tokens.length,
            });
            for (const sub of batch) {
              results.push({ success: true, fid: sub.fid });
            }
            continue;
          }

          // Try to parse JSON response
          const responseData = await response.json().catch(() => null);
          
          // If no JSON body or missing response arrays, treat all as successful
          if (!responseData || (
            !responseData.successfulTokens &&
            !responseData.invalidTokens &&
            !responseData.rateLimitedTokens
          )) {
            safeLog('info', '[notifications] Batch sent (no token arrays in response) - all tokens successful', {
              url,
              status: response.status,
              hasBody: !!responseData,
              bodyKeys: responseData ? Object.keys(responseData) : [],
              tokenCount: tokens.length,
            });
            for (const sub of batch) {
              results.push({ success: true, fid: sub.fid });
            }
            continue;
          }

          // Handle response with token arrays: successfulTokens, invalidTokens, rateLimitedTokens
          const successfulTokens = new Set(responseData.successfulTokens || []);
          const invalidTokens = new Set(responseData.invalidTokens || []);
          const rateLimitedTokens = new Set(responseData.rateLimitedTokens || []);

          // Process each subscription in the batch
          for (const sub of batch) {
            const token = sub.token;

            if (successfulTokens.has(token)) {
              results.push({ success: true, fid: sub.fid });
            } else if (invalidTokens.has(token)) {
              // Mark subscription as disabled (invalid token)
              try {
                await pokerDb.update(
                  'notification_subscriptions',
                  { id: sub.id },
                  {
                    enabled: false,
                    updated_at: new Date().toISOString(),
                  } as any
                );
                safeLog('info', '[notifications] Disabled subscription due to invalid token', {
                  fid: sub.fid,
                });
              } catch (updateError: any) {
                safeLog('warn', '[notifications] Failed to disable subscription with invalid token', {
                  fid: sub.fid,
                  error: updateError?.message || String(updateError),
                });
              }
              results.push({
                success: false,
                error: 'invalid token',
                fid: sub.fid,
              });
            } else if (rateLimitedTokens.has(token)) {
              // Keep enabled but mark as failed (can retry later)
              results.push({
                success: false,
                error: 'rate-limited',
                fid: sub.fid,
              });
            } else {
              // Token not in any list - treat as successful (Farcaster may have delivered it)
              // This handles cases where response format differs or tokens were accepted
              results.push({ success: true, fid: sub.fid });
            }
          }

          safeLog('info', '[notifications] Batch sent to notification URL', {
            url,
            tokenCount: tokens.length,
            successful: successfulTokens.size,
            invalid: invalidTokens.size,
            rateLimited: rateLimitedTokens.size,
          });
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          
          const errorMessage = fetchError?.name === 'AbortError'
            ? 'Timeout'
            : fetchError?.message || String(fetchError);
          
          safeLog('error', '[notifications] Failed to send batch to notification URL', {
            url,
            tokenCount: tokens.length,
            error: errorMessage,
          });
          
          // Mark all in batch as failed
          for (const sub of batch) {
            results.push({
              success: false,
              error: errorMessage,
              fid: sub.fid,
            });
          }
        }
      } catch (error: any) {
        safeLog('error', '[notifications] Unexpected error sending batch', {
          url,
          tokenCount: tokens.length,
          error: error?.message || String(error),
        });
        
        // Mark all in batch as failed
        for (const sub of batch) {
          results.push({
            success: false,
            error: error?.message || 'Unexpected error',
            fid: sub.fid,
          });
        }
      }
    }
  }

  // Add failed results for subscriptions that weren't valid
  const validFids = new Set(validSubscriptions.map(s => s.fid));
  for (const sub of subscriptions) {
    if (!validFids.has(sub.fid)) {
      results.push({
        success: false,
        error: !sub.enabled ? 'disabled' : 'no valid token/url',
        fid: sub.fid,
      });
    }
  }

  return results;
}

/**
 * Send notifications to multiple FIDs
 * Fetches subscriptions using new schema (token, notification_url columns)
 */
export async function sendBulkNotifications(
  fids: number[],
  payload: NotificationPayload,
  notificationId: string
): Promise<NotificationResult[]> {
  if (!ENABLE_NOTIFICATIONS) {
    safeLog('info', '[notifications] Notifications disabled, skipping bulk send', {
      count: fids.length,
    });
    return fids.map(fid => ({ success: false, error: 'Notifications disabled', fid }));
  }

  if (fids.length === 0) {
    return [];
  }

  // Fetch subscriptions for the FIDs using new schema
  // Query for enabled=true (CHECK constraint ensures enabled=true -> token IS NOT NULL)
  // sendNotificationsToSubscriptions will filter for valid token/url as additional safety
  let subscriptions: Subscription[] = [];
  try {
    const allSubscriptions = await pokerDb.fetch<any>('notification_subscriptions', {
      filters: { enabled: true },
      select: 'id,fid,enabled,notification_url,token,provider',
    });

    const fidSet = new Set(fids);
    subscriptions = allSubscriptions
      .filter((sub: any) => fidSet.has(sub.fid))
      .map((sub: any) => ({
        id: sub.id,
        fid: sub.fid,
        enabled: sub.enabled,
        notification_url: sub.notification_url,
        token: sub.token,
        provider: sub.provider,
      }));
  } catch (error: any) {
    safeLog('error', '[notifications] Failed to fetch subscriptions', {
      error: error?.message || String(error),
    });
    return fids.map(fid => ({ success: false, error: 'Failed to fetch subscriptions', fid }));
  }

  // Debug logging
  safeLog('info', '[notifications] Sending bulk notifications', {
    requestedFids: fids.length,
    subscriptionsFound: subscriptions.length,
    notificationId,
  });

  return sendNotificationsToSubscriptions(subscriptions, payload, notificationId);
}

/**
 * Log notification event to database for idempotency tracking
 * Uses UPSERT to update status/error on retries, preserving created_at
 */
export async function logNotificationEvent(
  eventType: 'game_created' | 'game_full',
  gameId: string,
  recipientFid: number,
  status: 'queued' | 'sent' | 'failed',
  error?: string
): Promise<void> {
  try {
    // Truncate error to safe length (500 chars)
    const errorText = error ? error.substring(0, 500) : null;

    // Use upsert to update status/error on retries
    // The unique constraint (event_type, game_id, recipient_fid) ensures we update existing rows
    // created_at is preserved by default on upsert
    await pokerDb.upsert('notification_events', {
      event_type: eventType,
      game_id: gameId,
      recipient_fid: recipientFid,
      status,
      error: errorText,
    } as any);
  } catch (dbError: any) {
    // Log the error but don't throw (notification sending shouldn't fail due to logging)
    safeLog('warn', '[notifications] Failed to log notification event', {
      eventType,
      gameId,
      recipientFid,
      error: dbError?.message || String(dbError),
    });
  }
}

/**
 * Check if notification event was successfully sent (for idempotency)
 * Returns true ONLY if status='sent', allowing retries for failed/queued events
 */
export async function notificationEventExists(
  eventType: 'game_created' | 'game_full',
  gameId: string,
  recipientFid: number
): Promise<boolean> {
  try {
    const events = await pokerDb.fetch<any>('notification_events', {
      filters: {
        event_type: eventType,
        game_id: gameId,
        recipient_fid: String(recipientFid),
        status: 'sent',
      },
      limit: 1,
    });
    return events && events.length > 0;
  } catch (error: any) {
    safeLog('warn', '[notifications] Failed to check notification event existence', {
      eventType,
      gameId,
      recipientFid,
      error: error?.message || String(error),
    });
    // On error, assume it doesn't exist (allow retry)
    return false;
  }
}

/**
 * Generate stable notification ID for idempotency
 * Must be <= 128 chars per Farcaster spec
 */
export function generateNotificationId(
  eventType: 'game_created' | 'game_full',
  gameId: string
): string {
  const id = `${eventType}:${gameId}`;
  // Truncate if needed (shouldn't happen with UUID gameIds, but enforce constraint)
  return id.length > MAX_NOTIFICATION_ID_LENGTH
    ? id.substring(0, MAX_NOTIFICATION_ID_LENGTH)
    : id;
}
