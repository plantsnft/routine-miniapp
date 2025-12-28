/**
 * Audit logging for sensitive operations (refunds, settlements, emergency withdraws)
 * Logs to console and optionally sends to webhook for alerting
 */

export interface RefundEvent {
  gameId: string;
  clubId: string;
  callerFid: number;
  playerFid: number;
  amount: string;
  currency: string;
  txHash: string;
  timestamp: string;
}

export interface SettlementEvent {
  gameId: string;
  clubId: string;
  callerFid: number;
  recipients: string[];
  amounts: string[];
  currency: string;
  txHash: string;
  timestamp: string;
}

// Type guard to ensure event has required fields
function hasRequiredFields(event: any): boolean {
  return event && event.gameId && event.clubId && event.txHash;
}

export interface EmergencyWithdrawEvent {
  token: string;
  amount: string;
  callerAddress: string;
  txHash: string;
  timestamp: string;
}

export interface BlockEvent {
  blockedByFid: number;
  targetFid: number;
  reason?: string;
  timestamp: string;
}

export interface UnblockEvent {
  unblockedByFid: number;
  targetFid: number;
  timestamp: string;
}

/**
 * Log refund event
 */
export async function logRefundEvent(event: RefundEvent): Promise<void> {
  const logEntry = {
    type: 'REFUND',
    ...event,
  };

  // Log to console (for Vercel logging)
  console.log('[AUDIT][REFUND]', JSON.stringify(logEntry));

  // Send to webhook if configured
  await sendToWebhook(logEntry).catch((err) => {
    // Never throw - logging must not break the main flow
    console.error('[AUDIT][REFUND] Webhook failed:', err);
  });
}

/**
 * Log settlement event
 */
export async function logSettlementEvent(event: SettlementEvent): Promise<void> {
  const logEntry = {
    type: 'SETTLEMENT',
    ...event,
  };

  // Log to console (for Vercel logging)
  console.log('[AUDIT][SETTLEMENT]', JSON.stringify(logEntry));

  // Send to webhook if configured
  await sendToWebhook(logEntry).catch((err) => {
    // Never throw - logging must not break the main flow
    console.error('[AUDIT][SETTLEMENT] Webhook failed:', err);
  });
}

/**
 * Log block user event
 */
export async function logBlockEvent(blockedByFid: number, targetFid: number, reason?: string): Promise<void> {
  const event: BlockEvent = {
    blockedByFid,
    targetFid,
    reason,
    timestamp: new Date().toISOString(),
  };

  const logEntry = {
    type: 'BLOCK_USER',
    ...event,
  };

  // Log to console (for Vercel logging)
  console.log('[AUDIT][BLOCK_USER]', JSON.stringify(logEntry));

  // Send to webhook if configured (non-blocking)
  await sendToWebhook(logEntry).catch((err) => {
    // Never throw - logging must not break the main flow
    console.error('[AUDIT][BLOCK_USER] Webhook failed:', err);
  });
}

/**
 * Log unblock user event
 */
export async function logUnblockEvent(unblockedByFid: number, targetFid: number): Promise<void> {
  const event: UnblockEvent = {
    unblockedByFid,
    targetFid,
    timestamp: new Date().toISOString(),
  };

  const logEntry = {
    type: 'UNBLOCK_USER',
    ...event,
  };

  // Log to console (for Vercel logging)
  console.log('[AUDIT][UNBLOCK_USER]', JSON.stringify(logEntry));

  // Send to webhook if configured (non-blocking)
  await sendToWebhook(logEntry).catch((err) => {
    // Never throw - logging must not break the main flow
    console.error('[AUDIT][UNBLOCK_USER] Webhook failed:', err);
  });
}

/**
 * Log emergency withdraw event
 */
export async function logEmergencyWithdrawEvent(event: EmergencyWithdrawEvent): Promise<void> {
  const logEntry = {
    type: 'EMERGENCY_WITHDRAW',
    ...event,
  };

  // Log to console (for Vercel logging)
  console.log('[AUDIT][EMERGENCY_WITHDRAW]', JSON.stringify(logEntry));

  // Send to webhook if configured
  await sendToWebhook(logEntry).catch((err) => {
    // Never throw - logging must not break the main flow
    console.error('[AUDIT][EMERGENCY_WITHDRAW] Webhook failed:', err);
  });
}

/**
 * Send log entry to webhook (if configured)
 */
async function sendToWebhook(logEntry: any): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  
  if (!webhookUrl) {
    // Webhook not configured - this is fine
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logEntry),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
  } catch (error) {
    // Re-throw to be caught by caller
    throw error;
  }
}

