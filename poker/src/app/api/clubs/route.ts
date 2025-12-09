import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE, HELLFIRE_OWNER_FID, BURRFRIENDS_OWNER_FID } from "~/lib/constants";
import type { ApiResponse, Club } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * GET /api/clubs
 * Get all clubs
 */
export async function GET(req: NextRequest) {
  try {
    if (!SUPABASE_URL) {
      throw new Error("Supabase not configured");
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/clubs?select=*&order=name.asc`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch clubs: ${text}`);
    }

    const clubs: Club[] = await res.json();
    return NextResponse.json<ApiResponse<Club[]>>({
      ok: true,
      data: clubs,
    });
  } catch (error: any) {
    console.error("[API][clubs] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch clubs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clubs/seed
 * Seed the two clubs (Hellfire and Burrfriends)
 * Should only be called once during initial setup
 */
export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      throw new Error("Supabase not configured");
    }

    if (!HELLFIRE_OWNER_FID || !BURRFRIENDS_OWNER_FID) {
      throw new Error("Club owner FIDs not configured in environment variables");
    }

    // Check if clubs already exist
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?select=slug`, {
      method: "GET",
      headers: SUPABASE_SERVICE_HEADERS,
    });

    if (!checkRes.ok) {
      throw new Error("Failed to check existing clubs");
    }

    const existing = await checkRes.json();
    const existingSlugs = existing.map((c: Club) => c.slug);

    const clubsToSeed = [
      {
        slug: "hellfire",
        owner_fid: HELLFIRE_OWNER_FID,
        name: "Hellfire Club",
        description: "Tormental's poker club",
      },
      {
        slug: "burrfriends",
        owner_fid: BURRFRIENDS_OWNER_FID,
        name: "Burrfriends",
        description: "Burr's poker club",
      },
    ];

    const clubsToCreate = clubsToSeed.filter(c => !existingSlugs.includes(c.slug));

    if (clubsToCreate.length === 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { message: "Clubs already seeded" },
      });
    }

    // Insert clubs
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: "POST",
      headers: {
        ...SUPABASE_SERVICE_HEADERS,
        Prefer: "return=representation",
      },
      body: JSON.stringify(clubsToCreate),
    });

    if (!insertRes.ok) {
      const text = await insertRes.text();
      throw new Error(`Failed to seed clubs: ${text}`);
    }

    const createdClubs: Club[] = await insertRes.json();

    // Ensure owners are in club_members with role='owner'
    for (const club of createdClubs) {
      // Upsert owner as club member
      await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
        method: "POST",
        headers: {
          ...SUPABASE_SERVICE_HEADERS,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify([{
          club_id: club.id,
          member_fid: club.owner_fid,
          role: "owner",
          status: "active",
        }]),
      });
    }

    return NextResponse.json<ApiResponse<Club[]>>({
      ok: true,
      data: createdClubs,
    });
  } catch (error: any) {
    console.error("[API][clubs] Seed error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to seed clubs" },
      { status: 500 }
    );
  }
}
