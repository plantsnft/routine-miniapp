import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fid = Number(body.fid);

    if (!fid) {
      return NextResponse.json(
        { ok: false, error: "fid is required" },
        { status: 400 }
      );
    }

    // 1) check if this fid already has a checkin row
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkins?fid=eq.${fid}&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!existingRes.ok) {
      const text = await existingRes.text();
      console.error("Supabase select error:", text);
      return NextResponse.json(
        { ok: false, error: "Failed to read existing checkin", detail: text },
        { status: 500 }
      );
    }

    const existing = await existingRes.json();
    
    // Helper functions for Pacific Time (PST/PDT) day boundaries
    // Day resets at 9 AM Pacific time
    // A "check-in day" runs from 9 AM Pacific to 8:59:59.999 AM Pacific the next day
    
    // Get which check-in day a date falls into (as a string identifier)
    // Check-in windows: 9 AM Pacific on Day N to 8:59:59.999 AM Pacific on Day N+1
    // Example: Window for "Jan 2" runs from 9 AM Jan 2 to 8:59:59 AM Jan 3
    const getCheckInDayId = (date: Date): string => {
      // Get date components in Pacific timezone
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      
      const parts = formatter.formatToParts(date);
      const year = parts.find(p => p.type === "year")?.value;
      const month = parts.find(p => p.type === "month")?.value;
      const day = parts.find(p => p.type === "day")?.value;
      const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
      
      // Determine which check-in window this falls into
      // If it's 9 AM or later, it's in today's window
      // If it's before 9 AM, it's in yesterday's window
      const checkInDate = new Date(parseInt(year!), parseInt(month!) - 1, parseInt(day!));
      if (hour < 9) {
        // Before 9 AM - belongs to previous day's window
        checkInDate.setDate(checkInDate.getDate() - 1);
      }
      // If 9 AM or later, use today's date
      
      // Return as YYYY-MM-DD string for easy comparison
      const checkInYear = checkInDate.getFullYear();
      const checkInMonth = String(checkInDate.getMonth() + 1).padStart(2, "0");
      const checkInDay = String(checkInDate.getDate()).padStart(2, "0");
      return `${checkInYear}-${checkInMonth}-${checkInDay}`;
    };

    const isInSameCheckInWindow = (date1: Date, date2: Date): boolean => {
      return getCheckInDayId(date1) === getCheckInDayId(date2);
    };

    const canCheckIn = (lastCheckinDate: Date | null, nowDate: Date): boolean => {
      if (!lastCheckinDate) return true;
      
      // Check if now is in a different check-in window than the last check-in
      return !isInSameCheckInWindow(lastCheckinDate, nowDate);
    };

    const getPacificDaysDiff = (date1: Date, date2: Date): number => {
      const dayId1 = getCheckInDayId(date1);
      const dayId2 = getCheckInDayId(date2);
      
      // Parse dates to calculate difference
      const [year1, month1, day1] = dayId1.split("-").map(Number);
      const [year2, month2, day2] = dayId2.split("-").map(Number);
      
      const d1 = new Date(year1, month1 - 1, day1);
      const d2 = new Date(year2, month2 - 1, day2);
      
      const msDiff = d2.getTime() - d1.getTime();
      return Math.floor(msDiff / (24 * 60 * 60 * 1000));
    };

    const nowDate = new Date();
    const now = nowDate.toISOString();

    // 2) if no row yet → insert new
    if (!existing || existing.length === 0) {
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/checkins`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          // this is still nice to have
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify([
          {
            fid,
            last_checkin: now,
            streak: 1,
          },
        ]),
      });

      if (!insertRes.ok) {
        const text = await insertRes.text();
        console.error("Supabase insert error:", text);
        return NextResponse.json(
          { ok: false, error: "Supabase insert failed", detail: text },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ok: true, streak: 1, mode: "insert" },
        { status: 200 }
      );
    }

    // 3) row exists → check if they can check in again (9 AM Pacific reset)
    const current = existing[0];
    const currentStreak =
      typeof current.streak === "number" && !isNaN(current.streak)
        ? current.streak
        : 0;

    const lastCheckinIso: string | null = current.last_checkin ?? null;
    const lastDate = lastCheckinIso ? new Date(lastCheckinIso) : null;

    // Check if user can check in (based on 9 AM Pacific reset)
    if (lastDate && !canCheckIn(lastDate, nowDate)) {
      // Already checked in today (after 9 AM Pacific) → do not allow another check-in
      return NextResponse.json(
        { 
          ok: false, 
          error: "You can only check in once per day. The day resets at 9 AM Pacific time.",
          streak: currentStreak, 
          mode: "already_checked_in" 
        },
        { status: 409 } // 409 Conflict - already checked in today
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

    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkins?fid=eq.${fid}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          last_checkin: now,
          streak: newStreak,
        }),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      console.error("Supabase update error:", text);
      return NextResponse.json(
        { ok: false, error: "Supabase update failed", detail: text },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, streak: newStreak, mode: "update" },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("API /api/checkin error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
