import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "~/lib/constants";
import { basketballDb } from "~/lib/basketballDb";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Handle Supabase Auth callback after email magic link click
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") || "/dashboard";

  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    });

    if (!error && data.user) {
      // Create or get profile for email user
      const email = data.user.email;
      if (email) {
        try {
          // Check if profile exists
          const profiles = await basketballDb.fetch("profiles", {
            filters: { email: email },
            limit: 1,
          });

          if (profiles.length === 0) {
            // Create new profile
            await basketballDb.insert("profiles", {
              auth_type: "email",
              email: email,
              farcaster_fid: null,
              is_admin: true, // MVP: all users are admin
            });
          }
        } catch (err) {
          console.error("[Auth Callback] Error creating profile:", err);
        }
      }

      // Redirect to dashboard
      return NextResponse.redirect(new URL(next, req.url));
    }
  }

  // If verification failed, redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth_failed", req.url));
}
