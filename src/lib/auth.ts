/**
 * Authentication utilities for SIWN (Sign-In With Network).
 * Handles both auto-sign-in and manual sign-in flows.
 */

import { sdk } from "@farcaster/miniapp-sdk";
import type { SiwnResponse } from "./types";

/**
 * Check if we're in a Warpcast/Farcaster context.
 */
export function isInWarpcast(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).farcaster || sdk?.actions?.signIn);
}

/**
 * Attempt to sign in using query string parameters (for dev/testing).
 * 
 * @param queryString - URL query string (e.g., "?fid=123&signature=...")
 * @returns SIWN response or null if not available
 */
export async function signInFromQueryString(queryString: string): Promise<SiwnResponse | null> {
  if (!queryString) return null;
  
  try {
    const res = await fetch("/api/siwn" + queryString);
    const data = await res.json();
    if (data?.ok && data?.fid) {
      return data;
    }
  } catch (error) {
    console.error("[Auth] Query string sign-in failed:", error);
  }
  
  return null;
}

/**
 * Perform SIWN sign-in using the Farcaster SDK.
 * 
 * @returns SIWN response with user FID and username
 */
export async function signInWithFarcaster(): Promise<SiwnResponse> {
  if (!sdk?.actions?.signIn) {
    return {
      ok: false,
      error: "Sign-in is not available. Please open this app inside Warpcast.",
    };
  }

  try {
    // Generate nonce for security
    const nonce = Math.random().toString(36).slice(2);
    
    // Request sign-in from host
    let result;
    try {
      result = await sdk.actions.signIn({
        nonce,
        acceptAuthAddress: true,
      });
    } catch (signInError: unknown) {
      const err = signInError as Error;
      console.error("[Auth] SDK signIn call failed:", err);
      return {
        ok: false,
        error: err?.message || "Sign-in request failed. Please try again.",
      };
    }

    if (!result || typeof result !== 'object') {
      return {
        ok: false,
        error: "Sign-in returned no result. Please try again.",
      };
    }

    // Verify with backend
    const resp = await fetch("/api/siwn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...result,
        nonce,
      }),
    });

    const json = await resp.json();

    if (resp.ok && json?.ok && json?.fid) {
      return {
        ok: true,
        fid: Number(json.fid),
        username: json.username,
      };
    }

    return {
      ok: false,
      error: json?.error || "Signed in but server could not resolve FID.",
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[Auth] Sign-in error:", err);
    return {
      ok: false,
      error: err?.message || "Sign-in failed. Please open this inside Warpcast and try again.",
    };
  }
}

