// src/app/api/siwn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const _NEYNAR_CLIENT_ID = process.env.NEYNAR_CLIENT_ID;

if (!NEYNAR_API_KEY) {
  console.warn("⚠️ NEYNAR_API_KEY is missing in env");
}

// helper: verify SIWN message using Neynar SDK
// Uses fetchSigners method which is the correct way to verify SIWN messages
async function verifyWithNeynar(payload: {
  message?: string;
  hash?: string;
  messageBytes?: string;
  signature: string;
}) {
  console.log("[SIWN][VERIFY] starting verification", {
    hasMessage: Boolean(payload.message),
    hasHash: Boolean(payload.hash),
    hasMessageBytes: Boolean(payload.messageBytes),
    hasSignature: Boolean(payload.signature),
  });

  try {
    const client = getNeynarClient();
    
    // Use message or hash (Warpcast sends one or the other)
    const message = payload.message || payload.hash || payload.messageBytes;
    
    if (!message) {
      console.log("[SIWN][VERIFY] no message/hash/messageBytes provided");
      return {
        ok: false,
        status: 400,
        error: "No message, hash, or messageBytes provided",
      };
    }

    console.log("[SIWN][VERIFY] calling fetchSigners", {
      messageLength: message?.length,
      messagePreview: message?.substring(0, 50),
      signatureLength: payload.signature?.length,
      signaturePreview: payload.signature?.substring(0, 50),
    });
    
    // Use the Neynar SDK's fetchSigners method (same as /api/auth/session-signers)
    const data = await client.fetchSigners({ 
      message, 
      signature: payload.signature 
    });
    
    const signers = data.signers;
    
    if (!signers || signers.length === 0) {
      console.log("[SIWN][VERIFY] no signers returned");
      return {
        ok: false,
        status: 401,
        error: "No valid signers found",
      };
    }

    const signer = signers[0];
    const fid = signer.fid;

    if (!fid) {
      console.log("[SIWN][VERIFY] signer has no FID");
      return {
        ok: false,
        status: 400,
        error: "Signer has no FID",
      };
    }

    console.log("[SIWN][VERIFY] success, fetching user data for FID", fid);

    // Fetch full user data
    const { users } = await client.fetchBulkUsers({ fids: [fid] });
    const user = users[0] || null;

    return {
      ok: true,
      data: {
        fid,
        username: user?.username,
        user,
        signer,
      },
    };
  } catch (error: any) {
    // Log detailed error info including response data if available
    const errorDetails: any = {
      message: error?.message || String(error),
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
    };
    
    console.log("[SIWN][VERIFY] SDK error", errorDetails);
    
    return {
      ok: false,
      status: error?.response?.status || 500,
      error: error?.response?.data || error?.message || String(error),
    };
  }
}

// ===== GET version (Warpcast often hits this) =====
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const message = searchParams.get("message");
  const signature = searchParams.get("signature");
  const hash = searchParams.get("hash"); // sometimes they call it hash
  // defensive logging without secrets
  try {
    console.log("[SIWN][GET] params", {
      hasMessage: Boolean(message),
      hasHash: Boolean(hash),
      hasSignature: Boolean(signature),
      hasFid: Boolean(searchParams.get("fid")),
    });
  } catch {}

  // 1) if Warpcast actually sent us a fid directly, just return it
  const fidFromHost = searchParams.get("fid");
  if (fidFromHost) {
    return NextResponse.json({
      ok: true,
      fid: Number(fidFromHost),
      username: undefined,
    });
  }

  // 2) no message/signature → same warning you were seeing
  if (!message && !signature && !hash) {
    return NextResponse.json(
      {
        ok: false,
        error: "No SIWN params found in URL.",
      },
      { status: 400 }
    );
  }

  // 3) some preview tools send hash instead of message.
  // try to verify with what we have
  const finalMessage = message || hash;
  const finalSignature = signature;

  if (!finalMessage || !finalSignature) {
    return NextResponse.json(
      {
        ok: false,
        error: "Got hash/signature but one of them is missing (need both).",
        debug: { message: finalMessage, signature: finalSignature },
      },
      { status: 400 }
    );
  }

  const result = await verifyWithNeynar({ message: finalMessage, signature: finalSignature });
  try {
    console.log("[SIWN][GET] neynar result", {
      ok: result.ok,
      hasData: Boolean((result as any)?.data),
      status: (result as any)?.status,
    });
  } catch {}

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Neynar error in SIWN GET.",
        neynar: result,
      },
      { status: 400 }
    );
  }

  // At this point Neynar should have told us who the user is
  // The verifyWithNeynar function returns { ok: true, data: { fid, username, user, signer } }
  const fid = result.data?.fid ?? result.data?.user?.fid ?? null;
  const username = result.data?.username ?? result.data?.user?.username ?? undefined;

  if (!fid) {
    return NextResponse.json(
      {
        ok: false,
        error: "SIWN verified but no FID was returned from Neynar.",
        neynar: result.data,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    fid: Number(fid),
    username,
  });
}

// ===== POST version (some hosts POST us SIWN) =====
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "Body was not JSON" },
      { status: 400 }
    );
  }

  // sometimes it's {message, signature}, sometimes {hash, signature}, sometimes {messageBytes}
  const message = body.message || body.hash;
  const messageBytes = body.messageBytes || body.message_bytes || body.message_bytes;
  const signature = body.signature;

  try {
    console.log("[SIWN][POST] body", {
      hasMessage: Boolean(body?.message),
      hasHash: Boolean(body?.hash),
      hasMessageBytes: Boolean(body?.messageBytes || body?.message_bytes),
      hasSignature: Boolean(signature),
      hasFid: Boolean(body?.fid),
    });
  } catch {}

  // host might send fid directly — in that case we’re good
  if (body.fid) {
    return NextResponse.json({
      ok: true,
      fid: Number(body.fid),
      username: body.username ?? undefined,
    });
  }

  if ((!message && !messageBytes) || !signature) {
    return NextResponse.json(
      {
        ok: false,
        error: "No message/hash/messageBytes and signature in request body.",
        debug: body,
      },
      { status: 400 }
    );
  }

  const result = await verifyWithNeynar({ message, hash: body.hash, messageBytes, signature });
  try {
    console.log("[SIWN][POST] neynar result", {
      ok: result.ok,
      hasData: Boolean((result as any)?.data),
      status: (result as any)?.status,
    });
  } catch {}

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Neynar error in SIWN POST.",
        neynar: result,
      },
      { status: 400 }
    );
  }

  const fid = result.data?.fid ?? result.data?.user?.fid ?? null;
  const username = result.data?.username ?? result.data?.user?.username ?? undefined;

  if (!fid) {
    return NextResponse.json(
      {
        ok: false,
        error: "SIWN verified but no FID was returned from Neynar.",
        neynar: result.data,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    fid: Number(fid),
    username,
  });
}
