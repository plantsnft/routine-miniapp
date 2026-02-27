import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isGlobalAdmin } from "~/lib/permissions";
import { getNeynarClient } from "~/lib/neynar";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

interface SearchResult {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
}

/**
 * GET /api/users/search?q=<query>
 * Search for users by username/display name (admin-only)
 * Uses Neynar searchUser API
 * 
 * Phase 20: Enhanced Blocklist System
 */
export async function GET(req: NextRequest) {
  try {
    // SAFETY: Require authentication
    const { fid } = await requireAuth(req);

    // SAFETY: Only global admins can search users (for blocking)
    if (!isGlobalAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only global admins can search users" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const query = url.searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();

    try {
      const client = getNeynarClient();
      const response = await client.searchUser({ q: trimmedQuery, limit: 10 });
      
      const users: SearchResult[] = (response.result?.users || []).map((user: any) => ({
        fid: user.fid,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url || user.pfp?.url,
      }));

      return NextResponse.json<ApiResponse<SearchResult[]>>({
        ok: true,
        data: users,
      });
    } catch (neynarError: any) {
      safeLog('error', '[users/search] Neynar search failed', { error: neynarError.message });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Search failed" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[users/search] Error', { error: error.message });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Search failed" },
      { status: 500 }
    );
  }
}
