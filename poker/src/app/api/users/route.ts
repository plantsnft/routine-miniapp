import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";
import { upsertUser } from "~/lib/supabase";
import type { ApiResponse, User } from "~/lib/types";

/**
 * POST /api/users
 * Create or update user record after SIWN authentication.
 * Body: { fid: number, username?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid, username } = body;

    if (!fid || typeof fid !== 'number') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing or invalid fid" },
        { status: 400 }
      );
    }

    // Fetch user data from Neynar
    const neynarClient = getNeynarClient();
    const { users } = await neynarClient.fetchBulkUsers({ fids: [fid] });
    const neynarUser = users[0];

    if (!neynarUser) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "User not found in Neynar" },
        { status: 404 }
      );
    }

    // Upsert user in database
    const user = await upsertUser({
      fid,
      username: neynarUser.username,
      display_name: neynarUser.display_name,
      avatar_url: neynarUser.pfp_url,
      wallet_address: neynarUser.verified_addresses?.eth_addresses?.[0] || undefined,
    });

    return NextResponse.json<ApiResponse<User>>({
      ok: true,
      data: user,
    });
  } catch (error: any) {
    console.error("[API][users] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to create/update user" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/users?fid=123
 * Get user by FID.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get("fid");

    if (!fidParam) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing fid parameter" },
        { status: 400 }
      );
    }

    const fid = parseInt(fidParam, 10);
    if (isNaN(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Invalid fid parameter" },
        { status: 400 }
      );
    }

    // Import here to avoid circular dependencies
    const { getUserByFid } = await import("~/lib/supabase");
    const user = await getUserByFid(fid);

    if (!user) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<User>>({
      ok: true,
      data: user,
    });
  } catch (error: any) {
    console.error("[API][users] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch user" },
      { status: 500 }
    );
  }
}
