import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isGlobalAdmin } from "~/lib/permissions";
import { blockUser, getAllBlockedUsers, unblockUser, getUserBlock, type UserBlock } from "~/lib/userBlocks";
import { logBlockEvent, logUnblockEvent } from "~/lib/audit-logger";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

/**
 * GET /api/admin/blocks
 * List all blocked users (admin-only)
 * 
 * SAFETY: Requires global admin auth
 */
export async function GET(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // SAFETY: Only global admins can view blocklist
    if (!isGlobalAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only global admins can view blocklist" },
        { status: 403 }
      );
    }

    const blockedUsers = await getAllBlockedUsers();

    return NextResponse.json<ApiResponse<UserBlock[]>>({
      ok: true,
      data: blockedUsers,
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[admin/blocks] GET error', { error: error.message });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch blocked users" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/blocks
 * Block a user (admin-only)
 * Body: { fid: number, reason?: string }
 * 
 * SAFETY: Requires global admin auth
 */
export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // SAFETY: Only global admins can block users
    if (!isGlobalAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only global admins can block users" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { fid: targetFid, reason } = body;

    if (!targetFid || typeof targetFid !== 'number') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing or invalid fid" },
        { status: 400 }
      );
    }

    // Prevent blocking yourself
    if (targetFid === fid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot block yourself" },
        { status: 400 }
      );
    }

    // Block user
    const block = await blockUser(targetFid, fid, reason);

    // Audit log (non-blocking)
    logBlockEvent(fid, targetFid, reason).catch(err => {
      safeLog('warn', '[admin/blocks] Failed to log block event', { error: err.message });
    });

    safeLog('info', '[admin/blocks] User blocked', { 
      blockedBy: fid, 
      targetFid,
      hasReason: !!reason 
    });

    return NextResponse.json<ApiResponse<UserBlock>>({
      ok: true,
      data: block,
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[admin/blocks] POST error', { error: error.message });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to block user" },
      { status: 500 }
    );
  }
}

