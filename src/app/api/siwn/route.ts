// src/app/api/siwn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

// we keep GET so localhost /api/siwn?fid=318447 still works
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fidParam = url.searchParams.get("fid");
  if (fidParam) {
    return NextResponse.json({
      ok: true,
      fid: Number(fidParam),
      source: "querystring",
    });
  }
  return NextResponse.json(
    { ok: false, error: "No SIWN params found in URL." },
    { status: 400 }
  );
}

// DEBUG POST: show me exactly what Warpcast is sending
export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "No JSON body in SIWN POST." },
      { status: 400 }
    );
  }

  // if Warpcast actually sent fid, return success right away
  if (body?.fid) {
    return NextResponse.json({
      ok: true,
      fid: Number(body.fid),
      source: "host-post",
      raw: body,
    });
  }

  // if it sent message + signature, try Neynar
  if (body?.message && body?.signature) {
    try {
      const client = getNeynarClient();
      const signerRes = await client.fetchSigners({
        message: body.message,
        signature: body.signature,
      });

      const signer = signerRes?.signers?.[0];
      if (signer?.fid) {
        return NextResponse.json({
          ok: true,
          fid: signer.fid,
          user: signer,
          source: "neynar-siwn",
          raw: body,
        });
      }

      // neynar answered but no fid
      return NextResponse.json(
        {
          ok: false,
          error: "Neynar could not resolve FID from message/signature.",
          raw: body,
          neynar: signerRes,
        },
        { status: 400 }
      );
    } catch (err: any) {
      return NextResponse.json(
        {
          ok: false,
          error: "Neynar error in SIWN POST.",
          detail: err?.message,
          raw: body,
        },
        { status: 500 }
      );
    }
  }

  // got something, but not what we expect
  return NextResponse.json(
    {
      ok: false,
      error: "POST hit SIWN but no fid/message/signature in body.",
      raw: body,
    },
    { status: 400 }
  );
}
