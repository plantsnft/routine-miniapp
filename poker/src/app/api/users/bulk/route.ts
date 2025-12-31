import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

/**
 * GET /api/users/bulk?fids=123,456,789
 * Get multiple users by FIDs (for hydrating participant lists)
 */
export async function GET(req: NextRequest) {
  try {
    // Require auth
    await requireAuth(req);
    
    const { searchParams } = new URL(req.url);
    const fidsParam = searchParams.get("fids");

    if (!fidsParam) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing fids parameter" },
        { status: 400 }
      );
    }

    const fids = fidsParam
      .split(',')
      .map(f => parseInt(f.trim(), 10))
      .filter(f => !isNaN(f) && f > 0);

    if (fids.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "No valid FIDs provided" },
        { status: 400 }
      );
    }

    // Fetch users from Neynar
    const neynarClient = getNeynarClient();
    const { users } = await neynarClient.fetchBulkUsers({ fids });

    // Map to simplified format
    const userData = users.map((user: any) => ({
      fid: user.fid,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.pfp?.url || user.pfp_url,
    }));

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: userData,
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    
    console.error("[API][users][bulk] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch users" },
      { status: 500 }
    );
  }
}







