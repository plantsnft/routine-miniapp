import { NextRequest, NextResponse } from "next/server";
import { HELLFIRE_OWNER_FID, HELLFIRE_CLUB_SLUG, HELLFIRE_CLUB_NAME, HELLFIRE_CLUB_DESCRIPTION } from "~/lib/constants";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { isGlobalAdmin } from "~/lib/permissions";
import type { ApiResponse, Club } from "~/lib/types";

/**
 * GET /api/clubs
 * Get Burrfriends club only (MVP-only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 */
export async function GET(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // MVP-only: Only return Burrfriends club
    let clubs = await pokerDb.fetch<Club>('clubs', {
      filters: { slug: HELLFIRE_CLUB_SLUG },
      select: '*',
      limit: 1,
    });

    // Last resort: if still no club found, try to get any club (migration safety net)
    // This ensures the app works even if slug doesn't match exactly
    if (clubs.length === 0) {
      const allClubs = await pokerDb.fetch<Club>('clubs', {
        select: '*',
        limit: 1,
      });
      if (allClubs.length > 0) {
        clubs = allClubs;
      }
    }

    return NextResponse.json<ApiResponse<Club[]>>({
      ok: true,
      data: clubs || [],
    });
  } catch (error: any) {

    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    console.error("[API][clubs] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch clubs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clubs/seed
 * Seed Burrfriends club (MVP-only)
 * Should only be called once during initial setup
 * 
 * SAFETY: Requires global admin auth
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 */
export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // SAFETY: Only global admins can seed clubs
    if (!isGlobalAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only global admins can seed clubs" },
        { status: 403 }
      );
    }

    if (!HELLFIRE_OWNER_FID) {
      throw new Error("HELLFIRE_OWNER_FID not configured in environment variables");
    }

    // Check if club already exists - use pokerDb
    const existing = await pokerDb.fetch<Club>('clubs', {
      filters: { slug: HELLFIRE_CLUB_SLUG },
      limit: 1,
    });

    if (existing.length > 0) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { message: "Burrfriends club already seeded", club: existing[0] },
      });
    }

    // Insert club - use pokerDb
    const clubToCreate = {
      slug: HELLFIRE_CLUB_SLUG,
      owner_fid: HELLFIRE_OWNER_FID,
      name: HELLFIRE_CLUB_NAME,
      description: HELLFIRE_CLUB_DESCRIPTION,
    };

    const createdClubs = await pokerDb.insert<Club>('clubs', [clubToCreate] as any) as Club[];
    const createdClub = createdClubs[0];

    // Ensure owner is in club_members with role='owner' - use pokerDb
    await pokerDb.upsert('club_members', {
      club_id: createdClub.id,
      member_fid: createdClub.owner_fid,
      role: "owner",
      status: "active",
    } as any);

    return NextResponse.json<ApiResponse<Club[]>>({
      ok: true,
      data: [createdClub],
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    console.error("[API][clubs] Seed error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to seed club" },
      { status: 500 }
    );
  }
}
