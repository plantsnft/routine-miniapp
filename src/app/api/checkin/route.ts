import { NextRequest, NextResponse } from "next/server";
import {
  getCheckinByFid,
  createCheckin,
  updateCheckin,
  type CheckinRecord,
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

    // Fetch user's check-in data from Supabase with timeout and error handling
    let checkin;
    try {
      checkin = await Promise.race([
        getCheckinByFid(fid),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error("Supabase query timeout")), 8000)
        )
      ]) as CheckinRecord | null;
    } catch (dbError: any) {
      console.error("[API] /api/checkin GET - Supabase error:", dbError);
      // Return default values if database query fails - don't crash the app
      return NextResponse.json<CheckinResponse>({
        ok: true,
        streak: 0,
        last_checkin: null,
        hasCheckedIn: false,
        hasCheckedInToday: false,
      });
    }

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

    const lastCheckin = checkin.last_checkin || null;
    let streak = typeof checkin.streak === "number" && !isNaN(checkin.streak)
      ? checkin.streak
      : 0;

    // Validate and adjust streak if user hasn't checked in for more than 1 day
    // This ensures the displayed streak is accurate even before they check in again
    if (lastCheckin) {
      const lastDate = new Date(lastCheckin);
      const nowDate = new Date();
      const daysDiff = getPacificDaysDiff(lastDate, nowDate);
      
      // If more than 1 day has passed, streak should be reset (but don't update DB until they check in)
      if (daysDiff > 1) {
        streak = 0; // Reset streak for display purposes
      }
    }

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
    // Ensure we always return valid JSON
    try {
      return NextResponse.json<CheckinResponse>(
        { ok: false, error: err?.message ?? "Unknown server error" },
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    } catch (jsonErr) {
      // Fallback if JSON serialization fails
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
}

/**
 * POST endpoint to record a user's check-in.
 */
export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (jsonError: any) {
      console.error("[API] /api/checkin POST - JSON parse error:", jsonError);
      return NextResponse.json<CheckinResponse>(
        { ok: false, error: "Invalid JSON in request body" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const fid = Number(body.fid);

    if (!fid) {
      return NextResponse.json<CheckinResponse>(
        { ok: false, error: "fid is required" },
        { status: 400 }
      );
    }

    // Get existing check-in record with error handling
    let existing;
    try {
      existing = await getCheckinByFid(fid);
    } catch (dbError: any) {
      console.error("[API] /api/checkin POST - Error fetching existing checkin:", dbError);
      // If we can't fetch existing, try to create new one
      existing = null;
    }
    
    const nowDate = new Date();
    const now = nowDate.toISOString();

    // If no record exists, create a new one
    if (!existing) {
      try {
        const newCheckin = await createCheckin(fid, now, 1, 1); // streak: 1, total_checkins: 1
        return NextResponse.json<CheckinResponse>(
          {
            ok: true,
            streak: newCheckin.streak,
            mode: "insert",
          },
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (createError: any) {
        console.error("[API] /api/checkin POST - Error creating checkin:", createError);
        // If create fails, it might be a race condition - try to fetch again
        try {
          const retryCheckin = await getCheckinByFid(fid);
          if (retryCheckin) {
            // Check-in was actually created by another request
            return NextResponse.json<CheckinResponse>(
              {
                ok: true,
                streak: retryCheckin.streak || 1,
                mode: "insert",
              },
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        } catch (retryError) {
          // Fall through to error handling
        }
        throw createError;
      }
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

    // Increment total check-ins count
    const currentTotalCheckins = typeof existing.total_checkins === "number" && !isNaN(existing.total_checkins)
      ? existing.total_checkins
      : 0;
    const newTotalCheckins = currentTotalCheckins + 1;

    // Update the check-in record
    let updated;
    try {
      updated = await updateCheckin(fid, {
        last_checkin: now,
        streak: newStreak,
        total_checkins: newTotalCheckins,
      });
    } catch (updateError: any) {
      console.error("[API] /api/checkin POST - Error updating checkin:", updateError);
      // If update fails, try to fetch the current state - it might have been updated
      try {
        const retryCheckin = await getCheckinByFid(fid);
        if (retryCheckin) {
          // Check-in was updated (maybe by another request)
          return NextResponse.json<CheckinResponse>(
            {
              ok: true,
              streak: retryCheckin.streak || newStreak,
              mode: "update",
            },
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (retryError) {
        // Fall through to error handling
      }
      throw updateError;
    }

    return NextResponse.json<CheckinResponse>(
      {
        ok: true,
        streak: updated.streak,
        mode: "update",
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[API] /api/checkin POST error:", err);
    
    // Handle JSON parsing errors specifically - but only if they happen before processing
    // If we get here and the request body was already parsed, it's a different error
    if (err instanceof SyntaxError && err.message.includes("JSON") && err.message.includes("request")) {
      return NextResponse.json<CheckinResponse>(
        { ok: false, error: "Invalid request format" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // For other errors, provide more context
    let errorMessage = "Unknown server error";
    if (err?.message) {
      // Don't expose internal error details, but log them
      if (err.message.includes("Supabase") || err.message.includes("database")) {
        errorMessage = "Database error. Please try again.";
      } else if (err.message.length < 100) {
        errorMessage = err.message;
      }
    }
    
    // Ensure we always return valid JSON
    try {
      return NextResponse.json<CheckinResponse>(
        { ok: false, error: errorMessage },
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    } catch (jsonErr) {
      // Fallback if JSON serialization fails
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
}
