import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Manifest } from '@farcaster/miniapp-core/src/manifest';
import { APP_URL } from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date for display in user's local timezone
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { // undefined uses user's locale
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short', // Shows timezone abbreviation (e.g., PST, EST)
  });
}

/**
 * Format time only (hour:minute AM/PM) in user's local timezone
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, { // undefined uses user's locale
    hour: 'numeric',
    minute: '2-digit',
    hour12: true, // 12-hour format
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

/**
 * Decode base64 accountAssociation payload and extract the domain.
 * Returns null if decoding fails or domain is missing.
 */
export function decodeAccountAssociationDomain(payload: string): string | null {
  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return parsed.domain || null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract domain from a URL (e.g., "https://poker-swart.vercel.app" -> "poker-swart.vercel.app")
 */
export function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    // If not a valid URL, assume it's already a domain
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

/**
 * Get Farcaster domain manifest for /.well-known/farcaster.json
 * 
 * Generates a reliable manifest with only safe fields that meet constraints.
 * Includes both `miniapp` (current) and `frame` (backward compatibility) objects.
 * 
 * Only includes fields we can guarantee meet constraints:
 * - Required: version, name, homeUrl, iconUrl
 * - Safe optional: subtitle, description, primaryCategory, tags, tagline, ogTitle, ogDescription, noindex
 * 
 * Omits fields with strict image dimension constraints until correct assets are added:
 * - splashImageUrl (needs 200x200)
 * - ogImageUrl (needs 1200x630 PNG)
 * - imageUrl (deprecated, expects 3:2)
 * - screenshotUrls (needs 1284x2778 screenshots)
 * 
 * @param baseUrl - The base URL of the app (e.g., https://poker-swart.vercel.app)
 * @param validateDomain - If true, validates that accountAssociation payload domain matches baseUrl (default: true)
 * @returns Manifest object
 * @throws Error if domain validation fails in production
 */
export async function getFarcasterDomainManifest(
  baseUrl?: string,
  validateDomain: boolean = true
): Promise<Manifest & { _diagnostics?: { domainMatch: boolean; expectedDomain: string; actualDomain: string | null } }> {
  // Use provided baseUrl, or fall back to APP_URL constant
  // For production, ensure baseUrl uses the deployed domain (https://poker-swart.vercel.app)
  const appUrl = baseUrl || APP_URL;
  const expectedDomain = extractDomainFromUrl(appUrl);
  
  // Get accountAssociation from env vars (preferred) or fallback
  // Support both single JSON env var or separate header/payload/signature vars
  let accountAssociation: { header: string; payload: string; signature: string };
  
  if (process.env.NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION) {
    accountAssociation = JSON.parse(process.env.NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION);
  } else if (
    process.env.FARCASTER_ASSOC_HEADER &&
    process.env.FARCASTER_ASSOC_PAYLOAD &&
    process.env.FARCASTER_ASSOC_SIGNATURE
  ) {
    accountAssociation = {
      header: process.env.FARCASTER_ASSOC_HEADER,
      payload: process.env.FARCASTER_ASSOC_PAYLOAD,
      signature: process.env.FARCASTER_ASSOC_SIGNATURE,
    };
  } else {
    // Fallback (should be replaced with correct values)
    accountAssociation = {
      header: "eyJmaWQiOjMxODQ0NywidHlwZSI6ImF1dGgiLCJrZXkiOiIweDdjNTI3ZDk1NmY0NzkyMEZlYzM4ZEZjNTgzNEZlMzFiNUE3MmRCMTIifQ",
      payload: "eyJkb21haW4iOiJyb3V0aW5lLXNtb2t5LnZlcmNlbC5hcHAifQ",
      signature: "edEJSA+ZYlH0pssvN99KYTk3EzwQPFUQ2grBw+zKlYcLJUZdTqf6brlZ7qnPBTlMRh72KspvXkmCQdV6llxRexw="
    };
  }
  
  // Validate domain match if requested
  const actualDomain = decodeAccountAssociationDomain(accountAssociation.payload);
  const domainMatch = actualDomain === expectedDomain;
  
  if (validateDomain && !domainMatch) {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const errorMessage = `Domain association mismatch: expected "${expectedDomain}" but payload contains "${actualDomain}". Update FARCASTER_ASSOC_* env vars or NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION.`;
    
    if (isProduction) {
      // Fail loud in production
      throw new Error(errorMessage);
    } else {
      // Warn in dev but continue
      console.warn(`[Farcaster Manifest] ⚠️  ${errorMessage}`);
    }
  }

  // iconUrl is required - use icon.png (must be 1024x1024 PNG, no alpha)
  const iconUrl = `${appUrl}/icon.png`;

  // Build miniapp object with only safe fields
  const miniappConfig: any = {
    version: '1' as const,
    name: process.env.APP_NAME || 'Poker Lobby',
    homeUrl: appUrl,
    iconUrl,
    // Include description (default if not set)
    description: process.env.APP_DESCRIPTION || 'Play poker games on Farcaster',
    // Safe optional fields (only include if set)
    ...(process.env.APP_SUBTITLE && { subtitle: process.env.APP_SUBTITLE }),
    ...(process.env.APP_PRIMARY_CATEGORY && { primaryCategory: process.env.APP_PRIMARY_CATEGORY }),
    ...(process.env.APP_TAGS && { tags: JSON.parse(process.env.APP_TAGS) }),
    ...(process.env.APP_TAGLINE && { tagline: process.env.APP_TAGLINE }),
    ...(process.env.APP_OG_TITLE && { ogTitle: process.env.APP_OG_TITLE }),
    ...(process.env.APP_OG_DESCRIPTION && { ogDescription: process.env.APP_OG_DESCRIPTION }),
    ...(process.env.APP_NOINDEX === 'true' && { noindex: true }),
    // Optional buttonTitle for backward compatibility
    ...(process.env.APP_BUTTON_TEXT && { buttonTitle: process.env.APP_BUTTON_TEXT }),
    // Webhook URL for receiving Farcaster Mini App events
    // Must be absolute URL (Farcaster requirement)
    webhookUrl: process.env.APP_WEBHOOK_URL || new URL('/api/farcaster/webhook', appUrl).href,
  };

  // Return manifest with both miniapp and frame (for backward compatibility)
  const manifest = {
    accountAssociation,
    miniapp: miniappConfig,
    // Frame object for backward compatibility (same structure as miniapp)
    frame: miniappConfig,
    // Include diagnostics in dev mode
    ...(process.env.NODE_ENV !== 'production' && {
      _diagnostics: {
        domainMatch,
        expectedDomain,
        actualDomain,
      },
    }),
  } as any as Manifest;
  
  return manifest;
}
