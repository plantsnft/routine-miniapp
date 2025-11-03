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

export function getMiniAppEmbedMetadata(ogImageUrl?: string) {
  return {
    version: '1', // Must be "1" not "next" per Farcaster docs
    imageUrl: ogImageUrl ?? APP_OG_IMAGE_URL,
    button: {
      title: APP_BUTTON_TEXT,
      action: {
        type: 'launch_frame',
        name: APP_NAME,
        url: APP_URL,
        splashImageUrl: APP_SPLASH_URL,
        splashBackgroundColor: APP_SPLASH_BACKGROUND_COLOR,
      },
    },
  };
}

export async function getFarcasterDomainManifest(): Promise<Manifest> {
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
      homeUrl: APP_URL,
      iconUrl: APP_ICON_URL,
      imageUrl: APP_OG_IMAGE_URL,
      buttonTitle: APP_BUTTON_TEXT ?? 'Launch Mini App',
      splashImageUrl: APP_SPLASH_URL,
      splashBackgroundColor: APP_SPLASH_BACKGROUND_COLOR,
      webhookUrl: APP_WEBHOOK_URL,
    },
  };
}
