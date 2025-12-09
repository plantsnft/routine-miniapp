import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import type { ApiResponse, ClubMember } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * GET /api/clubs/[id]/members
 * Get all members of a club
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!SUPABASE_URL) {
      throw new Error("Supabase not configured");
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/club_members?club_id=eq.${id}&select=*`,
      {
        method: "GET",
        headers: SUPABASE_SERVICE_HEADERS,
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch club members: ${text}`);
    }

    const members: ClubMember[] = await res.json();
    return NextResponse.json<ApiResponse<ClubMember[]>>({
      ok: true,
      data: members,
    });
  } catch (error: any) {
    console.error("[API][clubs][members] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch club members" },
      { status: 500 }
    );
  }
}
