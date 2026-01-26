'use client';

import { useEffect } from 'react';

/**
 * Initializes the Farcaster mini app by calling sdk.actions.ready()
 * This dismisses the splash screen and indicates the app is ready
 * 
 * See: https://miniapps.farcaster.xyz/docs/getting-started#making-your-app-display
 */
export function MiniAppInitializer() {
  useEffect(() => {
    // Import SDK dynamically to ensure it's available
    const initializeMiniApp = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        
        // Check if SDK and actions are available
        if (!sdk || !sdk.actions || typeof sdk.actions.ready !== 'function') {
          console.warn('[MiniAppInitializer] SDK actions.ready() not available');
          return;
        }

        // Call ready() to dismiss splash screen
        // This is required by Farcaster - the SDK handles whether it's needed
        await sdk.actions.ready();
        console.log('[MiniAppInitializer] ✅ sdk.actions.ready() called successfully');
      } catch (error) {
        // Log the error but don't break the app
        console.error('[MiniAppInitializer] ❌ Error calling ready():', error);
        // Try one more time after a short delay in case SDK wasn't loaded yet
        setTimeout(async () => {
          try {
            const { sdk } = await import('@farcaster/miniapp-sdk');
            if (sdk?.actions?.ready) {
              await sdk.actions.ready();
              console.log('[MiniAppInitializer] ✅ sdk.actions.ready() called successfully (retry)');
            }
          } catch (retryError) {
            console.debug('[MiniAppInitializer] Retry also failed (this is ok if not in mini app):', retryError);
          }
        }, 100);
      }
    };

    // Call immediately when component mounts
    initializeMiniApp();
  }, []); // Run once on mount

  // This component doesn't render anything
  return null;
}
