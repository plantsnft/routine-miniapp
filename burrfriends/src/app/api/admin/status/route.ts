/**
 * GET /api/admin/status
 * Get admin status for the authenticated user
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        fid,
        isAdmin: isAdmin(fid),
      },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to get admin status' },
      { status: 500 }
    );
  }
}

