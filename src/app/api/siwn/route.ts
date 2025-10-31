// src/app/api/siwn/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

// ---------------
// GET version – used when Warpcast appends ?hash=...&signature=...&fid=...
// ---------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hash = searchParams.get("hash");
  const signature = searchParams.get("signature");
  const fid = searchParams.get("fid");

  // if client already gave us a bare fid (rare, but ok)
  if (fid && !hash && !signature) {
    return NextResponse.json({ ok: true, fid: Number(fid) });
  }

  // if nothing was passed in the URL -> tell client to use POST flow
  if (!hash || !signature) {
    return NextResponse.json(
      {
        ok: false,
        error: "No SIWN params found in URL.",
      },
      { status: 400 }
    );
  }

  if (!NEYNAR_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing NEYNAR_API_KEY on server." },
      { status: 500 }
    );
  }

  // validate with Neynar
  const resp = await fetch(
    "https://api.neynar.com/v2/farcaster/siwn/validate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        hash,
        signature,
        // fid is optional in some flows
      }),
    }
  );

  const json = await resp.json();

  if (!resp.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: json?.message || "Neynar SIWN validate failed (GET).",
      },
      { status: 400 }
    );
  }

  const user = json?.user || json?.result || json;
  return NextResponse.json({
    ok: true,
    fid: Number(user?.fid),
    username: user?.username,
  });
}

// ---------------
// POST version – used by your React component after sdk.actions.signIn()
// ---------------
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // SDK usually returns something like { hash, signature, fid?, address? }
  const hash = body?.hash;
  const signature = body?.signature;
  const possibleFid = body?.fid;

  if (!hash || !signature) {
    return NextResponse.json(
      {
        ok: false,
        error: "No hash/signature in request body.",
      },
      { status: 400 }
    );
  }

  if (!NEYNAR_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing NEYNAR_API_KEY on server." },
      { status: 500 }
    );
  }

  const resp = await fetch(
    "https://api.neynar.com/v2/farcaster/siwn/validate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        hash,
        signature,
        // pass through fid if we got one
        fid: possibleFid ? Number(possibleFid) : undefined,
      }),
    }
  );

  const json = await resp.json();

  if (!resp.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: json?.message || "Neynar SIWN validate failed (POST).",
      },
      { status: 400 }
    );
  }

  const user = json?.user || json?.result || json;

  return NextResponse.json({
    ok: true,
    fid: Number(user?.fid),
    username: user?.username,
  });
}
