/**
 * Push notification utilities for Poker Lobby
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

  // Enhanced diagnostic logging
  safeLog('info', '[notifications] Valid subscriptions check', {
    totalSubscriptions: subscriptions.length,
    validSubscriptions: validSubscriptions.length,
    validFids: validSubscriptions.map(s => s.fid),
    invalidSubscriptions: subscriptions
      .filter(s => !validSubscriptions.includes(s))
      .map(s => ({
        fid: s.fid,
        enabled: s.enabled,
        hasToken: !!s.token,
        hasUrl: !!s.notification_url,
        reason: !s.enabled ? 'disabled' : (!s.token ? 'no token' : 'no url'),
      })),
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

  // Log URL grouping details
  safeLog('info', '[notifications] Grouped subscriptions by notification URL', {
    uniqueUrls: subscriptionsByUrl.size,
    urlGroups: Array.from(subscriptionsByUrl.entries()).map(([url, subs]) => ({
      url: url, // Log the actual URL to see where we're sending
      subscriptionCount: subs.length,
      fids: subs.map(s => s.fid),
    })),
  });

  const results: NotificationResult[] = [];

  /**
   * Recursively send a batch of subscriptions, splitting on domain mismatch errors
   * @param batch - Subscriptions to send
   * @param url - Notification URL
   * @param depth - Recursion depth (for logging)
   * @returns Results for this batch
   */
  async function sendBatchWithRetry(
    batch: Subscription[],
    url: string,
    depth: number = 0
  ): Promise<NotificationResult[]> {
    if (batch.length === 0) {
      return [];
    }

    const tokens = batch.map(sub => sub.token);

    // Log before making HTTP POST request
    safeLog('info', '[notifications] Sending HTTP POST to notification URL', {
      url: url,
      tokenCount: tokens.length,
      batchSize: batch.length,
      notificationId: trimmedNotificationId,
      title: title,
      body: body.substring(0, 50) + (body.length > 50 ? '...' : ''),
      targetUrl: targetUrl,
      depth,
    });

    // POST to the notification URL with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);

    try {
      const requestPayload = {
        notificationId: trimmedNotificationId,
        title,
        body,
        targetUrl,
        tokens,
      };
      
      // Log request payload for debugging (with tokens redacted)
      safeLog('info', '[notifications] Sending HTTP POST request payload', {
        url,
        notificationId: trimmedNotificationId,
        title,
        body: body.substring(0, 50),
        targetUrl,
        tokenCount: tokens.length,
        payloadSize: JSON.stringify(requestPayload).length,
        depth,
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Log response details
      safeLog('info', '[notifications] HTTP POST response received', {
        url: url,
        status: response.status,
        statusText: response.statusText,
        tokenCount: tokens.length,
        hasBody: response.body !== null,
        depth,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const isDomainError = response.status === 400 && 
          (errorText.toLowerCase().includes('domain') || 
           errorText.toLowerCase().includes('same domain'));

        safeLog('error', '[notifications] Notification API returned error', {
          url,
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 500),
          errorLength: errorText.length,
          tokenCount: tokens.length,
          notificationId: trimmedNotificationId,
          title: title.substring(0, 50),
          body: body.substring(0, 50),
          isDomainError,
          depth,
        });

        // Handle domain mismatch error by splitting batch
        if (isDomainError && batch.length > 1) {
          safeLog('info', '[notifications] Domain mismatch detected - splitting batch', {
            originalBatchSize: batch.length,
            depth,
          });

          // Split batch in half and retry each half
          const mid = Math.floor(batch.length / 2);
          const firstHalf = batch.slice(0, mid);
          const secondHalf = batch.slice(mid);

          const firstResults = await sendBatchWithRetry(firstHalf, url, depth + 1);
          const secondResults = await sendBatchWithRetry(secondHalf, url, depth + 1);

          return [...firstResults, ...secondResults];
        }

        // Single token failed or non-domain error - mark as failed
        // Single token failed or non-domain error - mark as failed
        return batch.map(sub => ({
          success: false,
          error: isDomainError ? 'domain mismatch' : `HTTP ${response.status}`,
          fid: sub.fid,
        }));
      }

      // Handle 204 No Content or empty body as success (all tokens succeeded)
      if (response.status === 204) {
        safeLog('info', '[notifications] Batch sent (204 No Content) - all tokens successful', {
          url,
          tokenCount: tokens.length,
          depth,
        });
        return batch.map(sub => ({ success: true, fid: sub.fid }));
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
          depth,
        });
        return batch.map(sub => ({ success: true, fid: sub.fid }));
      }

      // Handle response with token arrays: successfulTokens, invalidTokens, rateLimitedTokens
      const successfulTokens = new Set(responseData.successfulTokens || []);
      const invalidTokens = new Set(responseData.invalidTokens || []);
      const rateLimitedTokens = new Set(responseData.rateLimitedTokens || []);

      const batchResults: NotificationResult[] = [];

      // Process each subscription in the batch
      for (const sub of batch) {
        const token = sub.token;

        if (successfulTokens.has(token)) {
          batchResults.push({ success: true, fid: sub.fid });
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
          batchResults.push({
            success: false,
            error: 'invalid token',
            fid: sub.fid,
          });
        } else if (rateLimitedTokens.has(token)) {
          // Keep enabled but mark as failed (can retry later)
          batchResults.push({
            success: false,
            error: 'rate-limited',
            fid: sub.fid,
          });
        } else {
          // Token not in any list - treat as successful (Farcaster may have delivered it)
          // This handles cases where response format differs or tokens were accepted
          batchResults.push({ success: true, fid: sub.fid });
        }
      }

      safeLog('info', '[notifications] Batch sent to notification URL - detailed results', {
        url,
        tokenCount: tokens.length,
        successful: successfulTokens.size,
        invalid: invalidTokens.size,
        rateLimited: rateLimitedTokens.size,
        successfulFids: batch
          .filter(sub => successfulTokens.has(sub.token))
          .map(sub => sub.fid),
        invalidFids: batch
          .filter(sub => invalidTokens.has(sub.token))
          .map(sub => sub.fid),
        rateLimitedFids: batch
          .filter(sub => rateLimitedTokens.has(sub.token))
          .map(sub => sub.fid),
        depth,
      });

      return batchResults;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      const errorMessage = fetchError?.name === 'AbortError'
        ? 'Timeout'
        : fetchError?.message || String(fetchError);
      
      safeLog('error', '[notifications] Failed to send batch to notification URL', {
        url,
        tokenCount: tokens.length,
        error: errorMessage,
        depth,
      });
      
      // Mark all in batch as failed
      return batch.map(sub => ({
        success: false,
        error: errorMessage,
        fid: sub.fid,
      }));
    }
  }

  // Send to each URL group
  for (const [url, urlSubscriptions] of subscriptionsByUrl.entries()) {
    // Batch tokens into chunks of 100 (Farcaster limit)
    for (let i = 0; i < urlSubscriptions.length; i += MAX_TOKENS_PER_REQUEST) {
      const batch = urlSubscriptions.slice(i, i + MAX_TOKENS_PER_REQUEST);
      const batchResults = await sendBatchWithRetry(batch, url);
      results.push(...batchResults);
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
  let allSubscriptions: any[] = [];
  try {
    allSubscriptions = await pokerDb.fetch<any>('notification_subscriptions', {
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

  // Enhanced diagnostic logging
  safeLog('info', '[notifications] Subscription fetch details', {
    requestedFids: fids,
    requestedFidsCount: fids.length,
    allEnabledSubscriptions: allSubscriptions.length,
    matchedSubscriptions: subscriptions.length,
    matchedFids: subscriptions.map(s => s.fid),
    subscriptionsWithTokenUrl: subscriptions.filter(s => s.token && s.notification_url).length,
    subscriptionsMissingToken: subscriptions.filter(s => !s.token).map(s => s.fid),
    subscriptionsMissingUrl: subscriptions.filter(s => !s.notification_url).map(s => s.fid),
  });

  return sendNotificationsToSubscriptions(subscriptions, payload, notificationId);
}

/**
 * Log notification event to database for idempotency tracking
 * INSERT; on 409 (duplicate event_type, game_id, recipient_fid) UPDATE status/error
 */
export async function logNotificationEvent(
  eventType: 'game_created' | 'game_started' | 'game_full' | 'jenga_game_started' | 'jenga_turn_started' | 'jenga_player_eliminated' | 'jenga_turn_warning' | 'jenga_turn_time_updated',
  gameId: string,
  recipientFid: number,
  status: 'queued' | 'sent' | 'failed',
  error?: string
): Promise<void> {
  const errorText = error ? error.substring(0, 500) : null;
  const row = { event_type: eventType, game_id: gameId, recipient_fid: recipientFid, status, error: errorText };

  try {
    await pokerDb.insert('notification_events', [row as any]);
  } catch (dbError: any) {
    const msg = dbError?.message || String(dbError);
    // 409 / 23505 = duplicate (event_type, game_id, recipient_fid) — update existing row
    if (msg.includes('409') || msg.includes('23505')) {
      try {
        await pokerDb.update('notification_events', { event_type: eventType, game_id: gameId, recipient_fid: recipientFid }, { status, error: errorText });
      } catch (upErr: any) {
        safeLog('warn', '[notifications] Failed to update notification event after 409', { eventType, gameId, recipientFid, error: upErr?.message });
      }
      return;
    }
    safeLog('warn', '[notifications] Failed to log notification event', { eventType, gameId, recipientFid, error: msg });
  }
}

/**
 * Check if notification event was successfully sent (for idempotency)
 * Returns true ONLY if status='sent', allowing retries for failed/queued events
 */
export async function notificationEventExists(
  eventType: 'game_created' | 'game_started' | 'game_full' | 'jenga_game_started' | 'jenga_turn_started' | 'jenga_player_eliminated' | 'jenga_turn_warning' | 'jenga_turn_time_updated',
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
  eventType: 'game_created' | 'game_started' | 'game_full' | 'jenga_game_started' | 'jenga_turn_started' | 'jenga_player_eliminated' | 'jenga_turn_warning' | 'jenga_turn_time_updated',
  gameId: string
): string {
  const id = `${eventType}:${gameId}`;
  // Truncate if needed (shouldn't happen with UUID gameIds, but enforce constraint)
  return id.length > MAX_NOTIFICATION_ID_LENGTH
    ? id.substring(0, MAX_NOTIFICATION_ID_LENGTH)
    : id;
}

/**
 * Unified function to prepare game creation notification payload
 * Works for both poker games (all subscribers) and BETR games (BETR registrants only)
 * 
 * @param gameId - Game ID
 * @param gameType - 'poker' | 'buddy_up' | 'betr_guesser'
 * @param gameData - Game data object (prize_amount, guesses_close_at, etc.)
 * @param targetUrl - Deep link URL for the notification
 * @returns Notification payload or null if disabled/no recipients
 */
export async function prepareGameCreationNotification(
  gameId: string,
  gameType: 'poker' | 'buddy_up' | 'betr_guesser' | 'jenga' | 'the_mole' | 'nl_holdem',
  gameData: {
    prize_amount?: number;
    guesses_close_at?: string;
    turn_time_seconds?: number;
    [key: string]: any;
  },
  targetUrl: string
): Promise<{
  subscriberFids: number[];
  title: string;
  body: string;
  targetUrl: string;
  notificationId: string;
  gameId: string;
} | null> {
  const enableNotifications = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';
  
  if (!enableNotifications) {
    safeLog('info', '[notifications] Notifications disabled - skipping', { gameId, gameType });
    return null;
  }

  try {
    // Determine recipient FIDs based on game type
    let eligibleFids: number[] = [];
    
    if (gameType === 'poker') {
      // Poker games: all enabled notification subscribers
      const subscriptions = await pokerDb.fetch<{ fid: number }>('notification_subscriptions', {
        filters: { enabled: true },
        select: 'fid',
      });
      eligibleFids = (subscriptions || []).map(s => Number(s.fid));
    } else {
      // BETR games: intersection of betr_games_registrations and enabled subscriptions
      const [registrations, subscriptions] = await Promise.all([
        pokerDb.fetch<{ fid: number }>('betr_games_registrations', {
          select: 'fid',
          limit: 10000,
        }),
        pokerDb.fetch<{ fid: number }>('notification_subscriptions', {
          filters: { enabled: true },
          select: 'fid',
        }),
      ]);
      
      const registrationFids = new Set((registrations || []).map(r => Number(r.fid)));
      const subscriptionFids = new Set((subscriptions || []).map(s => Number(s.fid)));
      eligibleFids = Array.from(registrationFids).filter(fid => subscriptionFids.has(fid));
    }

    if (eligibleFids.length === 0) {
      safeLog('info', '[notifications] No eligible recipients', {
        gameId,
        gameType,
        eligibleCount: 0,
        audience: gameType === 'poker' ? 'enabled_subscriptions' : 'betr_games_registrations ∩ enabled_subscriptions',
      });
      return null;
    }

    // Build notification body based on game type
    let notificationBody: string;
    const prizeAmount = gameData.prize_amount || 0;
    const prizeText = prizeAmount > 0 ? `${prizeAmount} BETR` : 'BETR';

    // Get staking requirement
    const stakingMinAmount = gameData.staking_min_amount;
    const hasStakingRequirement = stakingMinAmount && stakingMinAmount > 0;
    let stakingText = '';
    if (hasStakingRequirement) {
      const { formatPrizeAmount } = await import('~/lib/format-prize');
      stakingText = ` Staking: ${formatPrizeAmount(stakingMinAmount)} BETR required.`;
    }

    if (gameType === 'betr_guesser' && gameData.guesses_close_at) {
      // BETR GUESSER: include countdown timer
      const { formatCountdown } = await import('~/lib/utils');
      const countdown = formatCountdown(gameData.guesses_close_at);
      if (countdown) {
        notificationBody = `Prize: ${prizeText}. Guesses close in ${countdown}.${stakingText}`;
      } else {
        // Fallback (shouldn't happen due to validation, but safety check)
        notificationBody = `Prize: ${prizeText}. Guesses close soon.${stakingText}`;
      }
    } else if (gameType === 'buddy_up') {
      // BUDDY UP: simple prize message
      notificationBody = `Prize: ${prizeText}. Sign up now!${stakingText}`;
    } else if (gameType === 'the_mole') {
      // THE MOLE: simple prize message
      notificationBody = `Prize: ${prizeText}. Sign up now!${stakingText}`;
    } else if (gameType === 'jenga') {
      // JENGA: include turn time
      const turnTimeSeconds = gameData.turn_time_seconds || 60;
      const turnTimeMinutes = Math.floor(turnTimeSeconds / 60);
      notificationBody = `Prize: ${prizeText}. Turn time: ${turnTimeMinutes}m. Sign up now!${stakingText}`;
    } else if (gameType === 'nl_holdem') {
      notificationBody = `Prize: ${prizeText}. NL HOLDEM Sit & Go. Sign up now!${stakingText}`;
    } else {
      // Poker games: handled separately (more complex logic for buy-in vs prize)
      // This function won't be called for poker games, but include for completeness
      notificationBody = `Prize: ${prizeText}. Join now!${stakingText}`;
    }

    // Build title based on game type
    const title = gameType === 'buddy_up'
      ? 'New BUDDY UP game'
      : gameType === 'betr_guesser'
      ? 'New BETR GUESSER game'
      : gameType === 'jenga'
      ? 'New JENGA game'
      : gameType === 'the_mole'
      ? 'New THE MOLE game'
      : gameType === 'nl_holdem'
      ? 'New NL HOLDEM game'
      : 'New BETR WITH BURR game';

    // Generate notification ID based on game type
    const notificationId = gameType === 'jenga'
      ? generateNotificationId('jenga_game_started', gameId)
      : generateNotificationId('game_created', gameId);

    safeLog('info', '[notifications] Prepared game creation notification', {
      gameId,
      gameType,
      eligibleCount: eligibleFids.length,
      title,
      body: notificationBody.substring(0, 50) + '...',
    });

    return {
      subscriberFids: eligibleFids,
      title,
      body: notificationBody,
      targetUrl,
      notificationId,
      gameId,
    };
  } catch (error: any) {
    safeLog('error', '[notifications] Failed to prepare game creation notification', {
      gameId,
      gameType,
      error: error?.message || String(error),
    });
    return null;
  }
}

/**
 * Unified function to send notifications asynchronously after response
 * Reusable pattern for all game creation notifications
 * 
 * @param payload - Notification payload from prepareGameCreationNotification
 */
export async function sendGameCreationNotificationAsync(
  payload: {
    subscriberFids: number[];
    title: string;
    body: string;
    targetUrl: string;
    notificationId: string;
    gameId: string;
  }
): Promise<void> {
  try {
    const {
      sendBulkNotifications,
      logNotificationEvent,
      notificationEventExists,
    } = await import('~/lib/notifications');
    
    safeLog('info', '[notifications] Starting async notification send', {
      gameId: payload.gameId,
      subscriberCount: payload.subscriberFids.length,
    });

    // Send notifications in bulk
    const results = await sendBulkNotifications(
      payload.subscriberFids,
      {
        title: payload.title,
        body: payload.body,
        targetUrl: payload.targetUrl,
      },
      payload.notificationId
    );

    // Log notification events for idempotency
    // Determine event type from notification ID (game_created:xxx or game_started:xxx)
    // Detect event type from notification ID prefix
    let eventType: 'game_created' | 'game_started' | 'game_full' | 'jenga_game_started' | 'jenga_turn_started' | 'jenga_player_eliminated' | 'jenga_turn_warning' | 'jenga_turn_time_updated' = 'game_created';
    if (payload.notificationId.startsWith('game_started:')) {
      eventType = 'game_started';
    } else if (payload.notificationId.startsWith('jenga_game_started:')) {
      eventType = 'jenga_game_started';
    } else if (payload.notificationId.startsWith('jenga_turn_started:')) {
      eventType = 'jenga_turn_started';
    } else if (payload.notificationId.startsWith('jenga_player_eliminated:')) {
      eventType = 'jenga_player_eliminated';
    } else if (payload.notificationId.startsWith('jenga_turn_warning:')) {
      eventType = 'jenga_turn_warning';
    } else if (payload.notificationId.startsWith('jenga_turn_time_updated:')) {
      eventType = 'jenga_turn_time_updated';
    }
    
    for (const result of results) {
      if (result.fid !== undefined) {
        const alreadySent = await notificationEventExists(eventType, payload.gameId, result.fid);
        if (!alreadySent) {
          await logNotificationEvent(
            eventType,
            payload.gameId,
            result.fid,
            result.success ? 'sent' : 'failed',
            result.error
          );
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    safeLog('info', '[notifications] Async notification send completed', {
      gameId: payload.gameId,
      subscriberCount: payload.subscriberFids.length,
      successCount,
      failedCount,
    });
  } catch (asyncError: any) {
    safeLog('error', '[notifications] Async notification send failed', {
      gameId: payload.gameId,
      error: asyncError?.message || String(asyncError),
    });
  }
}

/**
 * Send JENGA-specific notification to specific FIDs
 * Used for turn started, player eliminated, turn warning, turn time updated
 */
/**
 * Send notification to a single FID
 * Phase 21: Helper for winner notifications after settlement
 * 
 * @param fid - Recipient FID
 * @param payload - Notification payload (title, body, targetUrl)
 * @param notificationId - Unique notification ID for idempotency
 * @returns Promise resolving to notification result
 */
export async function sendNotificationToFid(
  fid: number,
  payload: NotificationPayload,
  notificationId: string
): Promise<NotificationResult> {
  if (!ENABLE_NOTIFICATIONS) {
    safeLog('info', '[notifications] Notifications disabled, skipping single send', { fid });
    return { success: false, error: 'Notifications disabled', fid };
  }

  const results = await sendBulkNotifications([fid], payload, notificationId);
  return results[0] || { success: false, error: 'No result', fid };
}

/**
 * Send JENGA-specific notification to specific FIDs
 * Used for turn started, player eliminated, turn warning, turn time updated
 */
export async function sendJengaNotificationAsync(
  fids: number[],
  eventType: 'jenga_turn_started' | 'jenga_player_eliminated' | 'jenga_turn_warning' | 'jenga_turn_time_updated',
  gameId: string,
  title: string,
  body: string,
  targetUrl: string,
  fid?: number // Optional FID for notifications that include FID in notification ID
): Promise<void> {
  if (!ENABLE_NOTIFICATIONS || fids.length === 0) {
    return;
  }

  try {
    const notificationId = fid !== undefined
      ? `${eventType}:${gameId}:${fid}`
      : `${eventType}:${gameId}`;

    // Truncate notification ID if needed
    const trimmedNotificationId = notificationId.length > MAX_NOTIFICATION_ID_LENGTH
      ? notificationId.substring(0, MAX_NOTIFICATION_ID_LENGTH)
      : notificationId;

    const { after } = await import('next/server');
    
    after(async () => {
      try {
        const results = await sendBulkNotifications(
          fids,
          { title, body, targetUrl },
          trimmedNotificationId
        );

        // Log notification events for idempotency
        for (const result of results) {
          if (result.fid !== undefined) {
            const alreadySent = await notificationEventExists(eventType, gameId, result.fid);
            if (!alreadySent) {
              await logNotificationEvent(
                eventType,
                gameId,
                result.fid,
                result.success ? 'sent' : 'failed',
                result.error
              );
            }
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;
        
        safeLog('info', '[notifications] JENGA notification sent', {
          eventType,
          gameId,
          recipientCount: fids.length,
          successCount,
          failedCount,
        });
      } catch (error: any) {
        safeLog('error', '[notifications] JENGA notification send failed', {
          eventType,
          gameId,
          error: error?.message || String(error),
        });
      }
    });
  } catch (error: any) {
    safeLog('error', '[notifications] Failed to schedule JENGA notification', {
      eventType,
      gameId,
      error: error?.message || String(error),
    });
  }
}
