/**
 * Redaction utilities for logging sensitive data
 * 
 * NEVER log decrypted credentials, tokens, raw headers, or other secrets.
 * Use these utilities to redact sensitive information from logs.
 */

/**
 * Redact sensitive strings from logs
 * Returns "[REDACTED]" for any string that might contain sensitive data
 */
export function redact(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  return '[REDACTED]';
}

/**
 * Redact an object, preserving structure but hiding sensitive fields
 */
export function redactObject<T extends Record<string, any>>(obj: T, sensitiveKeys: string[]): Partial<T> {
  const redacted: any = { ...obj };
  for (const key of sensitiveKeys) {
    if (key in redacted) {
      redacted[key] = '[REDACTED]';
    }
  }
  return redacted as Partial<T>;
}

/**
 * Redact common sensitive fields from objects
 */
export function redactSensitiveFields(obj: any): any {
  const sensitiveKeys = [
    'password',
    'clubgg_password',
    'clubggPassword',
    'game_password',
    'token',
    'authorization',
    'auth',
    'credential',
    'secret',
    'key',
    'private_key',
    'privateKey',
    'ciphertext',
    'creds_ciphertext',
    'creds_iv',
    'iv',
    'signature',
    'nonce',
  ];
  
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const redacted: any = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()));
    
    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveFields(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Safe logger that automatically redacts sensitive fields
 */
export function safeLog(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
  const redactedData = data ? redactSensitiveFields(data) : undefined;
  
  if (level === 'error') {
    console.error(`[${level.toUpperCase()}] ${message}`, redactedData);
  } else if (level === 'warn') {
    console.warn(`[${level.toUpperCase()}] ${message}`, redactedData);
  } else {
    console.log(`[${level.toUpperCase()}] ${message}`, redactedData);
  }
}

