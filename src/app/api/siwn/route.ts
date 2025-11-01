// src/app/api/siwn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

// small helper
function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// ---------------
// GET  (dev, ?fid=318447)
// ---------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fidParam = url.searchParams.get("fid");
  const message = url.searchParams.get("message");
  const signature = url.searchParams.get("signature");

  // 1) dev mode: ?fid=318447
  if (fidParam) {
    return NextResponse.json({
      ok: true,
      fid: Number(fidParam),
      message: "Resolved FID from querystring",
    });
  }

  // 2) sometimes host passes message/signature in query
  if (message && signature) {
    try {
      const client = getNeynarClient();
      const signerRes = await client.fetchSigners({ message, signature });
      const signer = signerRes?.signers?.[0];
      if (signer?.fid) {
        return NextResponse.json({
          ok: true,
          fid: signer.fid,
          user: signer,
          message: "Resolved from SIWN (GET)",
        });
      }
      return err("Got hash/signature but no fid — check host config.");
    } catch (e: any) {
      return err(e?.message || "Neynar error (GET)", 500);
    }
  }

  return err("No SIWN params found in URL.");
}

// ---------------
// POST  (real Warpcast flow)
// ---------------
export async function POST(req: NextRequest) {
  let body: any = null;

  // guard against empty body -> this was your error
  try {
    body = await req.json();
  } catch {
    // empty body
    return err("No JSON body in SIWN POST.");
  }

  const { fid: fidFromHost, message, signature } = body || {};

  // 1) sometimes Warpcast gives fid directly
  if (fidFromHost) {
    return NextResponse.json({
      ok: true,
      fid: Number(fidFromHost),
      message: "Resolved FID from host POST",
    });
  }

  // 2) normal path: message + signature
  if (!message || !signature) {
    return err("Got hash/signature but no fid — check host config.");
  }

  try {
    const client = getNeynarClient();
    // ask Neynar who signed this
    const signerRes = await client.fetchSigners({ message, signature });
    const signer = signerRes?.signers?.[0];

    if (!signer?.fid) {
      return err(
        "Got message/signature but Neynar could not resolve FID. Make sure your Vercel NEYNAR_API_KEY + NEYNAR_CLIENT_ID match the app.",
      );
    }

    // optional: get user profile
    const usersRes = await client.fetchBulkUsers({ fids: [signer.fid] });
    const user = usersRes?.users?.[0] ?? null;

    return NextResponse.json({
      ok: true,
      fid: signer.fid,
      user,
      message: "SIWN: resolved via POST",
    });
  } catch (e: any) {
    return err(e?.message || "Neynar error (POST)", 500);
  }
}
