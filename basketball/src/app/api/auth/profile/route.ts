import { NextRequest, NextResponse } from "next/server";
import { basketballDb } from "~/lib/basketballDb";

export interface ProfileResponse {
  ok: boolean;
  profile?: any;
  error?: string;
}

/**
 * Create or get profile for a user
 * Supports both Farcaster and Email auth
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auth_type, farcaster_fid, email } = body;

    if (!auth_type || (auth_type !== "farcaster" && auth_type !== "email")) {
      return NextResponse.json<ProfileResponse>(
        {
          ok: false,
          error: "Invalid auth_type. Must be 'farcaster' or 'email'",
        },
        { status: 400 }
      );
    }

    if (auth_type === "farcaster" && !farcaster_fid) {
      return NextResponse.json<ProfileResponse>(
        {
          ok: false,
          error: "farcaster_fid required for Farcaster auth",
        },
        { status: 400 }
      );
    }

    if (auth_type === "email" && !email) {
      return NextResponse.json<ProfileResponse>(
        {
          ok: false,
          error: "email required for Email auth",
        },
        { status: 400 }
      );
    }

    // Check if profile already exists
    let existingProfile;
    if (auth_type === "farcaster") {
      const profiles = await basketballDb.fetch("profiles", {
        filters: { farcaster_fid: farcaster_fid },
        limit: 1,
      });
      existingProfile = profiles[0];
    } else if (auth_type === "email" && email) {
      // email is guaranteed to be truthy here due to earlier validation
      const profiles = await basketballDb.fetch("profiles", {
        filters: { email: email },
        limit: 1,
      });
      existingProfile = profiles[0];
    }

    if (existingProfile) {
      return NextResponse.json<ProfileResponse>({
        ok: true,
        profile: existingProfile,
      });
    }

    // Create new profile
    const newProfile = {
      auth_type,
      farcaster_fid: auth_type === "farcaster" ? farcaster_fid : null,
      email: auth_type === "email" ? email : null,
      is_admin: true, // MVP: all users are admin
    };

    const created = await basketballDb.insert("profiles", newProfile);

    return NextResponse.json<ProfileResponse>({
      ok: true,
      profile: created[0],
    });
  } catch (error) {
    console.error("[Profile] Error creating profile:", error);
    return NextResponse.json<ProfileResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create profile",
      },
      { status: 500 }
    );
  }
}
