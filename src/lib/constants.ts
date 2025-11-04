import { type AccountAssociation } from '@farcaster/miniapp-core/src/manifest';

/**
 * Application constants and configuration values.
 *
 * This file contains all the configuration constants used throughout the mini app.
 * These values are either sourced from environment variables or hardcoded and provide
 * configuration for the app's appearance, behavior, and integration settings.
 *
 * NOTE: This file is automatically updated by the init script.
 * Manual changes may be overwritten during project initialization.
 */

// --- App Configuration ---
/**
 * The base URL of the application.
 * Used for generating absolute URLs for assets and API endpoints.
 */
export const APP_URL: string = process.env.NEXT_PUBLIC_URL!;

/**
 * The name of the mini app as displayed to users.
 * Used in titles, headers, and app store listings.
 */
export const APP_NAME: string | undefined = process.env.NEXT_PUBLIC_APP_NAME;

/**
 * The description of the mini app.
 * Used in metadata and app store listings.
 */
export const APP_DESCRIPTION: string | undefined = process.env.NEXT_PUBLIC_APP_DESCRIPTION;

/**
 * The button text displayed on the mini app card.
 * Used in the Farcaster mini app manifest.
 */
export const APP_BUTTON_TEXT: string | undefined = process.env.NEXT_PUBLIC_APP_BUTTON_TEXT;

/**
 * The webhook URL for the mini app.
 * Used for receiving events from Farcaster.
 */
export const APP_WEBHOOK_URL: string | undefined = process.env.NEXT_PUBLIC_APP_WEBHOOK_URL;

/**
 * Account association for the mini app.
 * Used to associate the mini app with a Farcaster account.
 * If not provided, the mini app will be unsigned and have limited capabilities.
 */
export const APP_ACCOUNT_ASSOCIATION: AccountAssociation | undefined = process.env
  .NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION
  ? JSON.parse(process.env.NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION)
  : undefined;

/**
 * The URL of the splash image displayed when the mini app loads.
 * Used in the Farcaster mini app manifest.
 */
export const APP_SPLASH_URL: string = `${APP_URL}/logo.png`;

/**
 * Background color for the splash screen.
 * Used as fallback when splash image is loading.
 */
export const APP_SPLASH_BACKGROUND_COLOR: string = '#000000';

/**
 * Catwalk channel creator FIDs
 * TODO: Update this list with the actual creator FIDs when provided
 */
export const CATWALK_CREATOR_FIDS: number[] = [
  // Add creator FIDs here when provided
  // Example: 318447, 123456, etc.
];

/**
 * Whether analytics are enabled for the mini app.
 */
export const ANALYTICS_ENABLED: boolean = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';

/**
 * Return URL for the mini app.
 */
export const RETURN_URL: string | undefined = process.env.NEXT_PUBLIC_RETURN_URL;

/**
 * Icon URL for the mini app.
 */
export const APP_ICON_URL: string = `${APP_URL}/logo.png`;

/**
 * Whether wallet functionality is enabled.
 */
export const USE_WALLET: boolean = process.env.NEXT_PUBLIC_USE_WALLET === 'true';

/**
 * EIP-712 domain for signed key requests.
 */
export const SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN = {
  name: 'Farcaster SignedKeyRequestValidator',
  version: '1',
  chainId: 10,
  verifyingContract: '0x00000000fc700472606ed4fa22623acf62c60553' as `0x${string}`,
};

/**
 * EIP-712 types for signed key requests.
 */
export const SIGNED_KEY_REQUEST_TYPE = {
  SignedKeyRequest: [
    { name: 'requestFid', type: 'uint256' },
    { name: 'key', type: 'bytes' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Check-in configuration constants.
 */
export const CHECK_IN_RESET_HOUR = 9; // 9 AM Pacific
export const PACIFIC_TIMEZONE = "America/Los_Angeles";