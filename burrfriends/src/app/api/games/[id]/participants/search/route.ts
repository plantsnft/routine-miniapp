import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { getClubForGame, requireClubOwner } from "~/lib/pokerPermissions";
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
 * GET /api/games/[id]/participants/search?q=<query>
 * Search for users by name (for "Reserve a spot"). Club owner or global admin for the game only.
 * Uses Neynar searchUser API; same response shape as /api/users/search.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const { fid } = await requireAuth(req);

    const clubId = await getClubForGame(gameId);
    if (!clubId) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
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
      safeLog('error', '[games][participants][search] Neynar search failed', { error: neynarError.message });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Search failed" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    if (error.message?.includes('owner') || error.message?.includes('permission')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }
    safeLog('error', '[games][participants][search] Error', { error: error.message });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Search failed" },
      { status: 500 }
    );
  }
}
