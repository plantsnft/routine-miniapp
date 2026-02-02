import { NextRequest, NextResponse } from "next/server";
import { basketballDb } from "~/lib/basketballDb";

/**
 * GET /api/profile?fid=xxx or ?email=xxx
 * Get profile by FID or email
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get("fid");
    const email = searchParams.get("email");

    if (!fid && !email) {
      return NextResponse.json(
        { ok: false, error: "fid or email required" },
        { status: 400 }
      );
    }

    let profile;
    if (fid) {
      const profiles = await basketballDb.fetch("profiles", {
        filters: { farcaster_fid: parseInt(fid) },
        limit: 1,
      });
      profile = profiles.length > 0 ? profiles[0] : null;
    } else if (email) {
      // email is guaranteed to be non-null here due to earlier check
      const profiles = await basketballDb.fetch("profiles", {
        filters: { email: email },
        limit: 1,
      });
      profile = profiles.length > 0 ? profiles[0] : null;
    }

    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      profile: profile,
    });
  } catch (error) {
    console.error("[Profile] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch profile",
      },
      { status: 500 }
    );
  }
}
