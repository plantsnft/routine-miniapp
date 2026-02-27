/**
 * GET /api/beta/status - Check if user has beta access (cookie)
 * Phase 29.2: Beta Testing
 */

import { NextRequest, NextResponse } from "next/server";
import { hasBetaAccess } from "~/lib/beta";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const hasAccess = hasBetaAccess(req);
    return NextResponse.json<ApiResponse>({ ok: true, data: { hasAccess } });
  } catch (e: unknown) {
    console.error("[beta/status GET]", e);
    return NextResponse.json<ApiResponse>({ ok: true, data: { hasAccess: false } });
  }
}
