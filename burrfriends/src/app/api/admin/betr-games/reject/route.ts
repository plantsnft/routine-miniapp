/**
 * POST /api/admin/betr-games/reject
 * Reject a pending registration.
 * 
 * Phase 25: Opt-Out & Admin Registration Management
 * 
 * Sets rejected_at and rejected_by on the registration row.
 * Rejected users see "Awaiting Approval" but cannot re-register.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { fid: adminFid } = await requireAuth(req);

    if (!isAdmin(adminFid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "fid is required" },
        { status: 400 }
      );
    }

    // Check if registration exists and is pending
    const existing = await pokerDb.fetch<{ 
      fid: number; 
      approved_at: string | null;
      rejected_at: string | null;
    }>("betr_games_registrations", {
      filters: { fid },
      select: "fid,approved_at,rejected_at",
      limit: 1,
    });

    if (!existing || existing.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Registration not found" },
        { status: 404 }
      );
    }

    if (existing[0].approved_at !== null) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot reject approved registration (use remove instead)" },
        { status: 400 }
      );
    }

    if (existing[0].rejected_at !== null) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { rejected: true, alreadyRejected: true },
      });
    }

    // Reject the registration
    await pokerDb.update("betr_games_registrations", 
      { fid },
      { 
        rejected_at: new Date().toISOString(),
        rejected_by: adminFid,
      }
    );

    safeLog("info", "[admin/betr-games/reject] Rejected registration", { fid, adminFid });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { rejected: true, alreadyRejected: false },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    safeLog("error", "[admin/betr-games/reject] Error", { error: err?.message ?? String(error) });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to reject registration" },
      { status: 500 }
    );
  }
}
