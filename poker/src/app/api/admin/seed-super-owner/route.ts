import { NextRequest, NextResponse } from "next/server";
import {
  SUPABASE_SERVICE_ROLE,
  SUPER_OWNER_FID,
  HELLFIRE_OWNER_FID,
  BURRFRIENDS_OWNER_FID,
  HELLFIRE_CLUB_SLUG,
  HELLFIRE_CLUB_NAME,
  HELLFIRE_CLUB_DESCRIPTION,
  BURRFRIENDS_CLUB_SLUG,
  BURRFRIENDS_CLUB_NAME,
  BURRFRIENDS_CLUB_DESCRIPTION,
} from "~/lib/constants";
import type { ApiResponse, Club } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * POST /api/admin/seed-super-owner
 * Auto-seed route that:
 * 1. Creates Hellfire & Burrfriends clubs if they don't exist
 * 2. Ensures original owners are in club_members
 * 3. Ensures super owner (FID 318447) is owner/admin of both clubs
 * This is idempotent and safe to call multiple times.
 */
export async function POST(req: NextRequest) {
  try {
    // Get Supabase URL from environment variables
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

    // Check Supabase configuration with detailed logging
    const hasUrl = !!supabaseUrl;
    const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !SUPABASE_SERVICE_ROLE) {
      console.error('[API][admin][seed-super-owner] Supabase config check:', {
        hasUrl,
        hasAnonKey,
        hasServiceRole,
        urlLength: supabaseUrl?.length || 0,
        serviceRoleLength: process.env.SUPABASE_SERVICE_ROLE?.length || 0,
      });
      throw new Error("Supabase not configured");
    }

    // Check club owner FIDs with detailed logging
    const hasHellfireFid = !!process.env.HELLFIRE_OWNER_FID;
    const hasBurrfriendsFid = !!process.env.BURRFRIENDS_OWNER_FID;

    if (!HELLFIRE_OWNER_FID || !BURRFRIENDS_OWNER_FID) {
      console.error('[API][admin][seed-super-owner] Club owner FID check:', {
        hasHellfireFid,
        hasBurrfriendsFid,
        hellfireValue: process.env.HELLFIRE_OWNER_FID || 'not set',
        burrfriendsValue: process.env.BURRFRIENDS_OWNER_FID || 'not set',
      });
      throw new Error("Club owner FIDs not configured in environment variables");
    }

    // Step 1: Fetch or create clubs
    const clubsRes = await fetch(
      `${supabaseUrl}/rest/v1/clubs?select=id,slug,owner_fid&or=(slug.eq.${HELLFIRE_CLUB_SLUG},slug.eq.${BURRFRIENDS_CLUB_SLUG})`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    if (!clubsRes.ok) {
      throw new Error("Failed to fetch clubs");
    }

    const clubs = await clubsRes.json();
    let hellfireClub = clubs.find((c: any) => c.slug === HELLFIRE_CLUB_SLUG);
    let burrfriendsClub = clubs.find((c: any) => c.slug === BURRFRIENDS_CLUB_SLUG);

    // Create Hellfire club if it doesn't exist
    if (!hellfireClub) {
      const createHellfireRes = await fetch(`${supabaseUrl}/rest/v1/clubs`, {
        method: "POST",
        headers: {
          ...SUPABASE_SERVICE_HEADERS,
          Prefer: "return=representation",
        },
        body: JSON.stringify([{
          slug: HELLFIRE_CLUB_SLUG,
          owner_fid: HELLFIRE_OWNER_FID,
          name: HELLFIRE_CLUB_NAME,
          description: HELLFIRE_CLUB_DESCRIPTION,
        }]),
      });

      if (!createHellfireRes.ok) {
        const text = await createHellfireRes.text();
        throw new Error(`Failed to create Hellfire club: ${text}`);
      }

      const created = await createHellfireRes.json();
      hellfireClub = created[0];
    }

    // Create Burrfriends club if it doesn't exist
    if (!burrfriendsClub) {
      const createBurrfriendsRes = await fetch(`${supabaseUrl}/rest/v1/clubs`, {
        method: "POST",
        headers: {
          ...SUPABASE_SERVICE_HEADERS,
          Prefer: "return=representation",
        },
        body: JSON.stringify([{
          slug: BURRFRIENDS_CLUB_SLUG,
          owner_fid: BURRFRIENDS_OWNER_FID,
          name: BURRFRIENDS_CLUB_NAME,
          description: BURRFRIENDS_CLUB_DESCRIPTION,
        }]),
      });

      if (!createBurrfriendsRes.ok) {
        const text = await createBurrfriendsRes.text();
        throw new Error(`Failed to create Burrfriends club: ${text}`);
      }

      const created = await createBurrfriendsRes.json();
      burrfriendsClub = created[0];
    }

    // Step 2: Ensure all owners are in club_members
    // Upsert each membership individually to handle duplicates gracefully
    const memberships = [
      // Original Hellfire owner
      {
        club_id: hellfireClub.id,
        member_fid: HELLFIRE_OWNER_FID,
        role: 'owner',
        status: 'active',
      },
      // Original Burrfriends owner
      {
        club_id: burrfriendsClub.id,
        member_fid: BURRFRIENDS_OWNER_FID,
        role: 'owner',
        status: 'active',
      },
      // Super owner for Hellfire
      {
        club_id: hellfireClub.id,
        member_fid: SUPER_OWNER_FID,
        role: 'owner',
        status: 'active',
      },
      // Super owner for Burrfriends
      {
        club_id: burrfriendsClub.id,
        member_fid: SUPER_OWNER_FID,
        role: 'owner',
        status: 'active',
      },
    ];

    // Upsert each membership, treating duplicates as success
    // Use a try-insert, catch-duplicate pattern for idempotency
    for (const membership of memberships) {
      try {
        // Try to insert the membership
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/club_members`, {
          method: "POST",
          headers: {
            ...SUPABASE_SERVICE_HEADERS,
            Prefer: "return=representation",
          },
          body: JSON.stringify([membership]),
        });

        if (!insertRes.ok) {
          const errorText = await insertRes.text();
          let errorJson: any;
          try {
            errorJson = JSON.parse(errorText);
          } catch {
            // Not JSON, treat as text error
          }

          // Check if this is a duplicate key violation (23505)
          const isDuplicateError =
            errorJson?.code === '23505' ||
            errorJson?.code === 23505 ||
            (errorJson?.message && 
              (errorJson.message.includes('club_members_club_id_member_fid_key') ||
               errorJson.message.includes('duplicate key') ||
               errorJson.message.includes('23505'))) ||
            errorText.includes('23505') ||
            errorText.includes('club_members_club_id_member_fid_key') ||
            errorText.includes('duplicate key value violates unique constraint') ||
            errorText.includes('duplicate key');

          if (isDuplicateError) {
            // Duplicate membership - this is fine, it means it already exists
            // Try to update it to ensure role/status are correct
            await fetch(
              `${supabaseUrl}/rest/v1/club_members?club_id=eq.${membership.club_id}&member_fid=eq.${membership.member_fid}`,
              {
                method: "PATCH",
                headers: {
                  ...SUPABASE_SERVICE_HEADERS,
                },
                body: JSON.stringify({
                  role: membership.role,
                  status: membership.status,
                }),
              }
            );
            // Don't throw - membership exists which is what we want
            console.log(
              `[Seed] Membership already exists: club_id=${membership.club_id}, member_fid=${membership.member_fid}`
            );
            continue;
          }

          // Real error, throw it
          throw new Error(`Failed to upsert membership: ${errorText}`);
        }
      } catch (error: any) {
        // Check if this is a duplicate constraint error in the error message
        const errorMessage = error?.message || String(error);
        const isDuplicateError =
          errorMessage.includes('23505') ||
          errorMessage.includes('club_members_club_id_member_fid_key') ||
          errorMessage.includes('duplicate key value violates unique constraint') ||
          errorMessage.includes('duplicate key');

        if (isDuplicateError) {
          // Duplicate - treat as success
          // Try to update to ensure correct role/status
          try {
            await fetch(
              `${supabaseUrl}/rest/v1/club_members?club_id=eq.${membership.club_id}&member_fid=eq.${membership.member_fid}`,
              {
                method: "PATCH",
                headers: {
                  ...SUPABASE_SERVICE_HEADERS,
                },
                body: JSON.stringify({
                  role: membership.role,
                  status: membership.status,
                }),
              }
            );
          } catch {
            // Ignore update errors - membership exists which is the goal
          }
          console.log(
            `[Seed] Membership already exists (caught in catch): club_id=${membership.club_id}, member_fid=${membership.member_fid}`
          );
          continue;
        }
        // Re-throw real errors
        throw error;
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        status: "seeded",
        message: `Clubs and memberships seeded successfully. Super owner (FID ${SUPER_OWNER_FID}) has access to both clubs.`,
      },
    });
  } catch (error: any) {
    console.error("[API][admin][seed-super-owner] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to seed super owner" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/seed-super-owner
 * Check seeding status - shows clubs and membership status
 */
export async function GET(req: NextRequest) {
  try {
    // Get Supabase URL from environment variables
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

    // Check Supabase configuration with detailed logging
    const hasUrl = !!supabaseUrl;
    const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !SUPABASE_SERVICE_ROLE) {
      console.error('[API][admin][seed-super-owner] Supabase config check:', {
        hasUrl,
        hasAnonKey,
        hasServiceRole,
        urlLength: supabaseUrl?.length || 0,
        serviceRoleLength: process.env.SUPABASE_SERVICE_ROLE?.length || 0,
      });
      throw new Error("Supabase not configured");
    }

    // Fetch both clubs
    const clubsRes = await fetch(
      `${supabaseUrl}/rest/v1/clubs?select=id,slug,name,owner_fid&or=(slug.eq.${HELLFIRE_CLUB_SLUG},slug.eq.${BURRFRIENDS_CLUB_SLUG})`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    if (!clubsRes.ok) {
      throw new Error("Failed to fetch clubs");
    }

    const clubs = await clubsRes.json();
    
    const hellfireClub = clubs.find((c: any) => c.slug === HELLFIRE_CLUB_SLUG);
    const burrfriendsClub = clubs.find((c: any) => c.slug === BURRFRIENDS_CLUB_SLUG);

    const result: any = {
      super_owner_fid: SUPER_OWNER_FID,
      hellfire_exists: !!hellfireClub,
      burrfriends_exists: !!burrfriendsClub,
    };

    if (hellfireClub && burrfriendsClub) {
      // Check memberships
      const membersRes = await fetch(
        `${supabaseUrl}/rest/v1/club_members?member_fid=eq.${SUPER_OWNER_FID}&club_id=in.(${hellfireClub.id},${burrfriendsClub.id})&select=club_id,role,status`,
        { headers: SUPABASE_SERVICE_HEADERS }
      );

      if (membersRes.ok) {
        const memberships = await membersRes.json();
        result.hellfire_member = memberships.some((m: any) => m.club_id === hellfireClub.id);
        result.burrfriends_member = memberships.some((m: any) => m.club_id === burrfriendsClub.id);
        result.memberships = memberships;
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[API][admin][seed-super-owner] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to check super owner status" },
      { status: 500 }
    );
  }
}
