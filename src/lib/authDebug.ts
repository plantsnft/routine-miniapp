/**
 * Auth debug utilities for development only.
 * Tracks auth events with redaction of sensitive values.
 */

interface AuthEvent {
  name: string;
  timestamp: number;
  data?: Record<string, any>;
}

const MAX_EVENTS = 30;
const eventBuffer: AuthEvent[] = [];

/**
 * Redacts sensitive values from data, keeping only safe fields.
 */
function redactData(data?: Record<string, any>): Record<string, any> | undefined {
  if (!data) return undefined;

  const redacted: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip sensitive keys
    if (
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('signature') ||
      key.toLowerCase().includes('secret') ||
      key.toLowerCase().includes('private') ||
      key.toLowerCase().includes('password') ||
      key.toLowerCase().includes('nonce')
    ) {
      continue;
    }

    // Handle different value types
    if (value === null || value === undefined) {
      redacted[key] = value;
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      redacted[key] = value;
    } else if (typeof value === 'string') {
      // Only keep short strings (error messages, status codes, etc.)
      if (value.length <= 200) {
        redacted[key] = value;
      } else {
        redacted[key] = `[${value.length} chars]`;
      }
    } else if (Array.isArray(value)) {
      // For arrays, only store length or keys if it's an array of objects
      if (value.length === 0) {
        redacted[key] = [];
      } else if (typeof value[0] === 'object' && value[0] !== null) {
        // Array of objects - store keys only
        redacted[key] = value.map((item) => 
          typeof item === 'object' && item !== null ? Object.keys(item) : item
        );
      } else {
        redacted[key] = `[${value.length} items]`;
      }
    } else if (typeof value === 'object') {
      // For objects, only store keys or safe nested values
      if (key === 'keys' || key === 'resultKeys') {
        // Special case: keys arrays are safe
        redacted[key] = value;
      } else {
        // Store object keys only
        redacted[key] = Object.keys(value);
      }
    }
  }

  return redacted;
}

/**
 * Push an auth event to the debug buffer (dev-only).
 * No-op in production.
 */
export function pushAuthEvent(name: string, data?: Record<string, any>): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const event: AuthEvent = {
    name,
    timestamp: Date.now(),
    data: redactData(data),
  };

  eventBuffer.push(event);

  // Keep only the last MAX_EVENTS
  if (eventBuffer.length > MAX_EVENTS) {
    eventBuffer.shift();
  }
}

/**
 * Get all auth events from the buffer.
 * Returns empty array in production.
 */
export function getAuthEvents(): AuthEvent[] {
  if (process.env.NODE_ENV !== 'development') {
    return [];
  }
  return [...eventBuffer];
}

/**
 * Clear all auth events from the buffer.
 */
export function clearAuthEvents(): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  eventBuffer.length = 0;
}
