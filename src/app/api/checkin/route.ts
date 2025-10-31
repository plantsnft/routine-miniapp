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
    const now = new Date().toISOString();

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

    // 3) row exists → update it instead of 409
    const current = existing[0];

    // super simple streak logic for now: just +1
    const newStreak =
      typeof current.streak === "number" && !isNaN(current.streak)
        ? current.streak + 1
        : 1;

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
