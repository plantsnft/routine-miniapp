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

    // 3) row exists → update it instead of 409, with day-boundary streak logic
    const current = existing[0];
    const currentStreak =
      typeof current.streak === "number" && !isNaN(current.streak)
        ? current.streak
        : 0;

    const lastCheckinIso: string | null = current.last_checkin ?? null;
    const lastDate = lastCheckinIso ? new Date(lastCheckinIso) : null;

    // helpers inlined to avoid imports
    const toUtcYmd = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate()
      ).padStart(2, "0")}`;

    const sameUtcDay = (a: Date, b: Date) => toUtcYmd(a) === toUtcYmd(b);

    const daysDiffUtc = (a: Date, b: Date) => {
      // strip to midnight UTC by constructing new Date from Y-M-D
      const aMid = new Date(`${toUtcYmd(a)}T00:00:00.000Z`);
      const bMid = new Date(`${toUtcYmd(b)}T00:00:00.000Z`);
      const ms = bMid.getTime() - aMid.getTime();
      return Math.round(ms / (24 * 60 * 60 * 1000));
    };

    if (lastDate && sameUtcDay(lastDate, nowDate)) {
      // already checked in today → do not increment, avoid write
      return NextResponse.json(
        { ok: true, streak: currentStreak, mode: "noop" },
        { status: 200 }
      );
    }

    let newStreak: number;
    if (!lastDate) {
      newStreak = Math.max(1, currentStreak || 1);
    } else {
      const diff = daysDiffUtc(lastDate, nowDate);
      if (diff === 1) {
        newStreak = currentStreak + 1;
      } else if (diff > 1) {
        newStreak = 1; // broke streak
      } else {
        // If somehow diff < 0 (clock drift), just treat as same day handled above or reset
        newStreak = 1;
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
