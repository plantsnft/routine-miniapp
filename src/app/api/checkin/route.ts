import { NextRequest, NextResponse } from "next/server";
import {
  getCheckinByFid,
  createCheckin,
  updateCheckin,
} from "~/lib/supabase";
import {
  getCheckInDayId,
  canCheckIn,
  getPacificDaysDiff,
} from "~/lib/dateUtils";
import type { CheckinResponse } from "~/lib/types";

/**
 * GET endpoint to fetch user's check-in data (streak, last_checkin, etc.)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get("fid");

    if (!fidParam) {
      return NextResponse.json<CheckinResponse>(
        { ok: false, error: "fid query parameter is required" },
        { status: 400 }
      );
    }

    const fid = Number(fidParam);

    if (!fid || isNaN(fid)) {
      return NextResponse.json<CheckinResponse>(
        { ok: false, error: "Invalid fid" },
        { status: 400 }
      );
    }

    // Fetch user's check-in data from Supabase
    const checkin = await getCheckinByFid(fid);

    if (!checkin) {
      // No check-in record yet - return default values
      return NextResponse.json<CheckinResponse>({
        ok: true,
        streak: 0,
        last_checkin: null,
        hasCheckedIn: false,
        hasCheckedInToday: false,
      });
    }

    const streak = typeof checkin.streak === "number" && !isNaN(checkin.streak)
      ? checkin.streak
      : 0;
    const lastCheckin = checkin.last_checkin || null;

    // Check if user has already checked in today (based on 9 AM Pacific reset)
    let hasCheckedInToday = false;
    if (lastCheckin) {
      const lastDate = new Date(lastCheckin);
      const nowDate = new Date();
      hasCheckedInToday = getCheckInDayId(lastDate) === getCheckInDayId(nowDate);
    }

    return NextResponse.json<CheckinResponse>({
      ok: true,
      streak,
      last_checkin: lastCheckin,
      hasCheckedIn: !!lastCheckin,
      hasCheckedInToday,
    });
  } catch (err: any) {
    console.error("[API] /api/checkin GET error:", err);
    return NextResponse.json<CheckinResponse>(
      { ok: false, error: err?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to record a user's check-in.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fid = Number(body.fid);

    if (!fid) {
      return NextResponse.json<CheckinResponse>(
        { ok: false, error: "fid is required" },
        { status: 400 }
      );
    }

    // Get existing check-in record
    const existing = await getCheckinByFid(fid);
    const nowDate = new Date();
    const now = nowDate.toISOString();

    // If no record exists, create a new one
    if (!existing) {
      const newCheckin = await createCheckin(fid, now, 1);
      return NextResponse.json<CheckinResponse>(
        {
          ok: true,
          streak: newCheckin.streak,
          mode: "insert",
        },
        { status: 200 }
      );
    }

    // Check if user can check in (based on 9 AM Pacific reset)
    const currentStreak =
      typeof existing.streak === "number" && !isNaN(existing.streak)
        ? existing.streak
        : 0;

    const lastCheckinIso: string | null = existing.last_checkin ?? null;
    const lastDate = lastCheckinIso ? new Date(lastCheckinIso) : null;

    if (lastDate && !canCheckIn(lastDate, nowDate)) {
      // Already checked in today - return conflict
      return NextResponse.json<CheckinResponse>(
        {
          ok: false,
          error: "You can only check in once per day. The day resets at 9 AM Pacific time.",
          streak: currentStreak,
          mode: "already_checked_in",
        },
        { status: 409 } // 409 Conflict
      );
    }

    // Calculate new streak based on Pacific day boundaries (9 AM reset)
    let newStreak: number;
    if (!lastDate) {
      newStreak = Math.max(1, currentStreak || 1);
    } else {
      // Calculate days difference in Pacific check-in windows
      const daysDiff = getPacificDaysDiff(lastDate, nowDate);

      if (daysDiff === 1) {
        // Checked in consecutive day - increment streak
        newStreak = currentStreak + 1;
      } else if (daysDiff > 1) {
        // Missed a day or more - reset streak
        newStreak = 1;
      } else {
        // Same window (shouldn't happen due to canCheckIn check, but handle gracefully)
        newStreak = currentStreak;
      }
    }

    // Update the check-in record
    const updated = await updateCheckin(fid, {
      last_checkin: now,
      streak: newStreak,
    });

    return NextResponse.json<CheckinResponse>(
      {
        ok: true,
        streak: updated.streak,
        mode: "update",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[API] /api/checkin POST error:", err);
    return NextResponse.json<CheckinResponse>(
      { ok: false, error: err?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
