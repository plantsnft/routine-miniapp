import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireClubMember, requireClubOwner, requireHellfireClub } from "~/lib/pokerPermissions";
import type { ApiResponse, ClubMember } from "~/lib/types";

/**
 * GET /api/clubs/[id]/members
 * Get all members of a club
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireClubMember - enforces club membership
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await params;
    
    // MVP-only: Require Hellfire club
    await requireHellfireClub(clubId);
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // MVP: Open signup - club members endpoint is admin-only for MVP
    // Regular users don't need to be members to use the app
    // This endpoint is kept for admin/owner use
    const { isGlobalAdmin } = await import("~/lib/permissions");
    const { requireClubOwner } = await import("~/lib/pokerPermissions");
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
    }

    // Fetch members - use pokerDb
    const members = await pokerDb.fetch<ClubMember>('club_members', {
      filters: { club_id: clubId },
      select: '*',
    });

    return NextResponse.json<ApiResponse<ClubMember[]>>({
      ok: true,
      data: members,
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('member')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][clubs][members] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch club members" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clubs/[id]/members
 * Add or remove a member (club owner only)
 * Body: { action: 'add' | 'remove', fid: number }
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireClubOwner - only club owner can manage members
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await params;
    
    // MVP-only: Require Hellfire club
    await requireHellfireClub(clubId);
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // SAFETY: Require club ownership
    await requireClubOwner(fid, clubId);
    
    const body = await req.json();
    const { action, fid: targetFid } = body;

    if (!action || !targetFid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing action or fid" },
        { status: 400 }
      );
    }

    if (action === 'add') {
      // Add member - use pokerDb
      const memberData = {
        club_id: clubId,
        fid: targetFid,
        role: 'member',
        status: 'active',
      };
      
      await pokerDb.upsert<ClubMember>('club_members', memberData as any);
      
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { message: 'Member added' },
      });
    } else if (action === 'remove') {
      // Remove member - use pokerDb
      await pokerDb.delete('club_members', {
        club_id: clubId,
        fid: targetFid,
      });
      
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { message: 'Member removed' },
      });
    } else {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Invalid action. Use 'add' or 'remove'" },
        { status: 400 }
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
    // Handle permission errors
    if (error.message?.includes('owner') || error.message?.includes('permission')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][clubs][members] POST Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to manage club member" },
      { status: 500 }
    );
  }
}
