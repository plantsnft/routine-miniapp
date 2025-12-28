import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isGlobalAdmin } from "~/lib/permissions";
import { unblockUser, getUserBlock } from "~/lib/userBlocks";
import { logUnblockEvent } from "~/lib/audit-logger";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

/**
 * DELETE /api/admin/blocks/[fid]
 * Unblock a user (admin-only)
 * 
 * SAFETY: Requires global admin auth
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  try {
    const { fid: targetFidStr } = await params;
    const targetFid = parseInt(targetFidStr, 10);

    if (isNaN(targetFid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Invalid fid" },
        { status: 400 }
      );
    }

    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);

    // SAFETY: Only global admins can unblock users
    if (!isGlobalAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only global admins can unblock users" },
        { status: 403 }
      );
    }

    // Check if user is actually blocked
    const existingBlock = await getUserBlock(targetFid);
    if (!existingBlock || !existingBlock.is_blocked) {
      // Idempotent: if not blocked, return success
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { message: "User is not blocked" },
      });
    }

    // Unblock user
    await unblockUser(targetFid);

    // Audit log (non-blocking)
    logUnblockEvent(fid, targetFid).catch(err => {
      safeLog('warn', '[admin/blocks] Failed to log unblock event', { error: err.message });
    });

    safeLog('info', '[admin/blocks] User unblocked', { 
      unblockedBy: fid, 
      targetFid 
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { message: "User unblocked" },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    safeLog('error', '[admin/blocks] DELETE error', { error: error.message });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to unblock user" },
      { status: 500 }
    );
  }
}

