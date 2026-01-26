"use client";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface AuthResult {
  ok: boolean;
  fid?: number;
  email?: string;
  error?: string;
}

/**
 * Sign in with Farcaster using Neynar SIWN
 * Uses Farcaster Mini App SDK's signIn action
 */
export async function signInWithFarcaster(): Promise<AuthResult> {
  try {
    // Import SDK dynamically
    const { sdk } = await import("@farcaster/miniapp-sdk");

    if (!sdk?.actions?.signIn) {
      return {
        ok: false,
        error: "Sign-in is not available. Please open this app inside Warpcast.",
      };
    }

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

    if (!result || typeof result !== "object") {
      return {
        ok: false,
        error: "Sign-in returned no result. Please try again.",
      };
    }

    // Verify with backend
    const response = await fetch("/api/auth/siwn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...result,
        nonce,
      }),
    });

    const data = await response.json();

    if (response.ok && data.ok && data.fid) {
      // Create or get profile
      const profileResult = await fetch("/api/auth/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_type: "farcaster",
          farcaster_fid: data.fid,
        }),
      });

      if (profileResult.ok) {
        return {
          ok: true,
          fid: data.fid,
        };
      }
    }

    return {
      ok: false,
      error: data.error || "Farcaster sign-in failed",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Sign-in failed. Please open this inside Warpcast and try again.",
    };
  }
}

/**
 * Sign in with email using Supabase Auth magic link
 */
export async function signInWithEmail(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return {
        ok: false,
        error: error.message,
      };
    }

    return {
      ok: true,
      email,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Email sign-in failed",
    };
  }
}
