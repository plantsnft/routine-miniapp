// src/app/api/siwn/route.ts
import { NextRequest, NextResponse } from "next/server";

// simple helper for responses
function bad(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

// --------------
// GET VERSION
// --------------
// supports: /api/siwn?fid=318447  (desktop / dev / ngrok test)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fidParam = searchParams.get("fid");

  if (fidParam) {
    const fidNum = Number(fidParam);
    if (!Number.isNaN(fidNum)) {
      return NextResponse.json({
        ok: true,
        fid: fidNum,
        message: "Resolved FID from querystring",
      });
    }
  }

  // no FID found
  return bad("No SIWN params found in URL.");
}

// --------------
// POST VERSION
// --------------
// this is what Warpcast / sdk.actions.signIn(...) should call
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return bad("No JSON body.");
  }

  // Warpcast often gives back: { fid, hash, signature, ... }
  const { fid, hash, signature } = body || {};

  // for now: if we at least got a fid, we count it as success.
  // later we can call Neynar to verify hash/signature.
  if (fid) {
    return NextResponse.json({
      ok: true,
      fid: Number(fid),
      message: "SIWN mock: returning real Farcaster user from POST",
      raw: body,
    });
  }

  // if it sent hash/signature but no fid, tell the client
  if (hash || signature) {
    return bad("Got hash/signature but no fid — check host config.");
  }

  return bad("No hash/signature in request body.");
}
