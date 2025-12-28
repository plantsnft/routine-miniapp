/**
 * Correlation ID utilities for request tracing
 * Generates unique IDs for correlating logs across services
 * No secrets or sensitive data - just request tracking
 */

/**
 * Generate a correlation ID for a request
 * Format: timestamp-random (e.g., "1703123456789-abc123")
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Get correlation ID from request headers or generate a new one
 * Checks for 'x-correlation-id' header (standard) or generates new
 */
export function getCorrelationId(req?: { headers?: { get?: (name: string) => string | null } }): string {
  if (req?.headers?.get) {
    const existing = req.headers.get('x-correlation-id');
    if (existing) return existing;
  }
  return generateCorrelationId();
}

