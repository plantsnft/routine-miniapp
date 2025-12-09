import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { isClubOwnerOrAdmin } from "~/lib/permissions";
import type { ApiResponse, ClubAnnouncement, Club } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * GET /api/clubs/[id]/announcements
 * Get all announcements for a club
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await params;

    if (!SUPABASE_URL) {
      throw new Error("Supabase not configured");
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/club_announcements?club_id=eq.${clubId}&select=*&order=inserted_at.desc`,
      {
        method: "GET",
        headers: SUPABASE_SERVICE_HEADERS,
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch announcements: ${text}`);
    }

    const announcements: ClubAnnouncement[] = await res.json();
    return NextResponse.json<ApiResponse<ClubAnnouncement[]>>({
      ok: true,
      data: announcements,
    });
  } catch (error: any) {
    console.error("[API][clubs][announcements] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch announcements" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clubs/[id]/announcements
 * Create a new announcement (owner only)
 * Body: { creator_fid: number, title: string, body: string, related_game_id?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await params;
    const body = await req.json();
    const { creator_fid, title, body: announcementBody, related_game_id } = body;

    if (!creator_fid || !title || !announcementBody) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing required fields: creator_fid, title, body" },
        { status: 400 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      throw new Error("Supabase not configured");
    }

    // Verify club ownership
    const clubRes = await fetch(
      `${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}&select=owner_fid`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    if (!clubRes.ok) {
      throw new Error("Failed to verify club");
    }

    const clubs: Club[] = await clubRes.json();
    if (!clubs || clubs.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Club not found" },
        { status: 404 }
      );
    }

    if (!isClubOwnerOrAdmin(creator_fid, clubs[0])) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only club owner can create announcements" },
        { status: 403 }
      );
    }

    // Insert announcement
    const res = await fetch(`${SUPABASE_URL}/rest/v1/club_announcements`, {
      method: "POST",
      headers: {
        ...SUPABASE_SERVICE_HEADERS,
        Prefer: "return=representation",
      },
      body: JSON.stringify([{
        club_id: clubId,
        creator_fid,
        title,
        body: announcementBody,
        related_game_id: related_game_id || null,
      }]),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create announcement: ${text}`);
    }

    const announcements: ClubAnnouncement[] = await res.json();
    return NextResponse.json<ApiResponse<ClubAnnouncement>>({
      ok: true,
      data: announcements[0],
    });
  } catch (error: any) {
    console.error("[API][clubs][announcements] Create error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to create announcement" },
      { status: 500 }
    );
  }
}
