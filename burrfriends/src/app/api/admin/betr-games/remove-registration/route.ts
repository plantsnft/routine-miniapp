/**
 * POST /api/admin/betr-games/remove-registration
 * Remove an approved registration.
 * 
 * Phase 25: Opt-Out & Admin Registration Management
 * 
 * Deletes the registration row for an approved user.
 * User can re-register if before the deadline.
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

    // Check if registration exists and is approved
    const existing = await pokerDb.fetch<{ 
      fid: number; 
      approved_at: string | null;
    }>("betr_games_registrations", {
      filters: { fid },
      select: "fid,approved_at",
      limit: 1,
    });

    if (!existing || existing.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Registration not found" },
        { status: 404 }
      );
    }

    if (existing[0].approved_at === null) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot remove pending registration (use reject instead)" },
        { status: 400 }
      );
    }

    // Delete the registration
    await pokerDb.delete("betr_games_registrations", { fid });

    safeLog("info", "[admin/betr-games/remove-registration] Removed registration", { fid, adminFid });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { removed: true },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    safeLog("error", "[admin/betr-games/remove-registration] Error", { error: err?.message ?? String(error) });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to remove registration" },
      { status: 500 }
    );
  }
}
