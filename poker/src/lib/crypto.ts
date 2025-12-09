/**
 * Password encryption utilities.
 * For MVP, using a simple encoding. In production, use proper encryption.
 */

/**
 * Simple encryption for game passwords (MVP version).
 * TODO: Replace with proper encryption library (e.g., crypto-js, Web Crypto API).
 */
export function encryptPassword(password: string): string {
  // MVP: Simple base64 encoding
  // TODO: Implement proper encryption with a secret key
  return Buffer.from(password).toString('base64');
}

/**
 * Decrypt game password.
 */
export function decryptPassword(encryptedPassword: string): string {
  // MVP: Simple base64 decoding
  // TODO: Implement proper decryption
  try {
    return Buffer.from(encryptedPassword, 'base64').toString('utf-8');
  } catch (error) {
    throw new Error('Failed to decrypt password');
  }
}
