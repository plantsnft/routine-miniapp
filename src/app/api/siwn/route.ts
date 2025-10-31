// src/app/api/siwn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

// helper to build a clean success response
function ok(fid: number, username?: string) {
  return NextResponse.json({
    ok: true,
    fid,
    username: username ?? null,
    message: "SIWN: resolved Farcaster user from Neynar",
  });
}

// 1) GET handler – handles the “easy” case (query string params)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fidParam = url.searchParams.get("fid");
  const message = url.searchParams.get("message");
  const signature = url.searchParams.get("signature");

  // if the host gave us fid directly, we’re done
  if (fidParam) {
    return ok(Number(fidParam));
  }

  // if it gave us message + signature in the URL (rare), validate them
  if (message && signature) {
    try {
      const client = getNeynarClient();
      // this is the official Neynar way to turn SIWN into a user
      const result = await client.lookupUserBySiwn(message, signature);
      if (result?.fid) {
        return ok(result.fid, result.username);
      }
      return NextResponse.json(
        { ok: false, error: "Could not resolve user from SIWN (GET)." },
        { status: 400 }
      );
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: err?.message ?? "Neynar error (GET)" },
        { status: 500 }
      );
    }
  }

  // if we got here, nothing useful was sent
  return NextResponse.json(
    { ok: false, error: "No SIWN params found in URL." },
    { status: 400 }
  );
}

// 2) POST handler – this is what Warpcast mini-app preview actually uses
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const message = body?.message;
    const signature = body?.signature;
    const fidFromHost = body?.fid; // sometimes mobile gives this

    // if host already gave us fid, use it
    if (fidFromHost) {
      return ok(Number(fidFromHost));
    }

    if (!message || !signature) {
      return NextResponse.json(
        { ok: false, error: "No hash/signature in request body." },
        { status: 400 }
      );
    }

    const client = getNeynarClient();
    // this call is in the Neynar mini-app auth docs
    const result = await client.lookupUserBySiwn(message, signature);

    if (!result?.fid) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Got message/signature but couldn’t resolve FID. Make sure Neynar API key + client ID are correct on Vercel.",
        },
        { status: 400 }
      );
    }

    return ok(result.fid, result.username);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "SIWN server error" },
      { status: 500 }
    );
  }
}
