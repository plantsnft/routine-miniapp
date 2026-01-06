import crypto from "crypto";

/**
 * Verify HMAC SHA-512 signature for Neynar webhook requests.
 * Supports multiple active secrets for rotation.
 * 
 * Neynar requires:
 * - HMAC SHA-512 over raw request body string (UTF-8)
 * - Signature in X-Neynar-Signature header (hex string)
 * 
 * @param rawBody - Raw request body as string (UTF-8)
 * @param signature - Signature from X-Neynar-Signature header (hex string)
 * @param secrets - Array of webhook secrets to try (for rotation)
 * @returns true if signature is valid, false otherwise
 */
export function verifyNeynarWebhookSignature(
  rawBody: string,
  signature: string | null,
  secrets: string[]
): boolean {
  if (!signature || secrets.length === 0) {
    return false;
  }

  // Neynar sends signature as hex string (no prefix)
  const signatureHex = signature.trim();

  // Validate signature format (should be hex)
  if (!/^[0-9a-f]+$/i.test(signatureHex)) {
    return false;
  }

  const signatureBuffer = Buffer.from(signatureHex, "hex");

  // Try each secret (for rotation support)
  for (const secret of secrets) {
    if (!secret) continue;

    // Compute HMAC SHA-512 over raw body (UTF-8)
    const expectedSignature = crypto
      .createHmac("sha512", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    // Safe length check before timing-safe comparison
    if (signatureBuffer.length !== expectedBuffer.length) {
      continue; // Length mismatch - try next secret
    }

    // Use timing-safe comparison to prevent timing attacks
    if (crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return true;
    }
  }

  return false;
}

/**
 * Get webhook secrets from environment variables.
 * Supports multiple secrets separated by commas for rotation.
 * 
 * @returns Array of webhook secrets
 */
export function getWebhookSecrets(): string[] {
  const secretEnv = process.env.NEYNAR_WEBHOOK_SECRET || "";
  if (!secretEnv) {
    return [];
  }

  // Support comma-separated secrets for rotation
  return secretEnv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
