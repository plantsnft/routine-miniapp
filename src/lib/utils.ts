import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Manifest } from '@farcaster/miniapp-core/src/manifest';
import {
  APP_BUTTON_TEXT,
  APP_DESCRIPTION,
  APP_ICON_URL,
  APP_NAME,
  APP_OG_IMAGE_URL,
  APP_PRIMARY_CATEGORY,
  APP_SPLASH_BACKGROUND_COLOR,
  APP_SPLASH_URL,
  APP_TAGS,
  APP_URL,
  APP_WEBHOOK_URL,
  APP_ACCOUNT_ASSOCIATION,
} from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMiniAppEmbedMetadata(ogImageUrl?: string, baseUrl?: string) {
  // Get base URL - prioritize provided baseUrl, then APP_URL, then env var, then fallback
  const appUrl = baseUrl || APP_URL || process.env.NEXT_PUBLIC_URL || 'https://routine-smoky.vercel.app';
  
  const imageUrl = ogImageUrl ?? `${appUrl}/api/opengraph-image`;
  const splashImageUrl = `${appUrl}/splash.png`;
  
  return {
    version: '1', // Must be "1" not "next" per Farcaster docs
    imageUrl,
    button: {
      title: APP_BUTTON_TEXT,
      action: {
        type: 'launch_frame',
        name: APP_NAME,
        url: appUrl,
        splashImageUrl,
        splashBackgroundColor: APP_SPLASH_BACKGROUND_COLOR,
      },
    },
  };
}

export async function getFarcasterDomainManifest(baseUrl?: string): Promise<Manifest> {
  // Use provided baseUrl, or fall back to APP_URL, or use environment variable
  const appUrl = baseUrl || APP_URL || process.env.NEXT_PUBLIC_URL || 'https://routine-smoky.vercel.app';
  
  // Use environment variable if available, otherwise use the signed accountAssociation
  const accountAssociation = APP_ACCOUNT_ASSOCIATION || {
    header: "eyJmaWQiOjMxODQ0NywidHlwZSI6ImF1dGgiLCJrZXkiOiIweDdjNTI3ZDk1NmY0NzkyMEZlYzM4ZEZjNTgzNEZlMzFiNUE3MmRCMTIifQ",
    payload: "eyJkb21haW4iOiJyb3V0aW5lLXNtb2t5LnZlcmNlbC5hcHAifQ",
    signature: "edEJSA+ZYlH0pssvN99KYTk3EzwQPFUQ2grBw+zKlYcLJUZdTqf6brlZ7qnPBTlMRh72KspvXkmCQdV6llxRexw="
  };

  return {
    accountAssociation,
    miniapp: {
      version: '1',
      name: APP_NAME ?? 'Neynar Starter Kit',
      homeUrl: appUrl,
      iconUrl: `${appUrl}/icon.png`,
      imageUrl: `${appUrl}/api/opengraph-image`,
      buttonTitle: APP_BUTTON_TEXT ?? 'Launch Mini App',
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: APP_SPLASH_BACKGROUND_COLOR,
      webhookUrl: APP_WEBHOOK_URL || `https://api.neynar.com/f/app/${process.env.NEYNAR_CLIENT_ID}/event`,
    },
  };
}
