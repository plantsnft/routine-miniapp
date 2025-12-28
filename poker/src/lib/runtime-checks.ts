/**
 * Runtime startup checks for production readiness
 * 
 * NOTE: We no longer run these checks at module load time to avoid build failures.
 * Instead, validation happens lazily when encryption/decryption functions are called
 * (see credsVault.ts). This ensures checks only run at actual runtime in API routes,
 * not during Next.js build/page data collection.
 * 
 * This file remains for potential future use, but currently does not execute
 * any checks at module load time.
 */

/**
 * Check that required environment variables are set
 * This function is available but not called automatically.
 * Use lazy validation in actual functions that need these env vars instead.
 */
export function checkProductionConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Critical secret required for credential encryption
  if (!process.env.POKER_CREDS_ENCRYPTION_KEY) {
    const error = 'POKER_CREDS_ENCRYPTION_KEY environment variable is required';
    if (isProduction) {
      throw new Error(`[CRITICAL] ${error}`);
    } else {
      console.warn(`[WARNING] ${error} - Credentials encryption will fail at runtime`);
    }
  }
  
  // Check Supabase configuration
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    const error = 'SUPABASE_URL and SUPABASE_SERVICE_ROLE environment variables are required';
    if (isProduction) {
      throw new Error(`[CRITICAL] ${error}`);
    } else {
      console.warn(`[WARNING] ${error}`);
    }
  }
}

// NOTE: We intentionally do NOT run checks at module load time.
// Validation happens lazily when encryption functions are actually called.

