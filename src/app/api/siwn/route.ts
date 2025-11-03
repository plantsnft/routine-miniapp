// src/app/api/siwn/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_CLIENT_ID = process.env.NEYNAR_CLIENT_ID;

if (!NEYNAR_API_KEY) {
  console.warn("⚠️ NEYNAR_API_KEY is missing in env");
}

// helper: actually call Neynar with whichever payload host provided
async function verifyWithNeynar(payload: {
  message?: string;
  hash?: string;
  messageBytes?: string;
  signature: string;
}) {
  // this is the most common SIWN verify path in current Neynar mini-app flow
  // we also fallback to alternative path if 404 is returned
  const primaryUrl = "https://api.neynar.com/v2/farcaster/siwn/verify";
  const fallbackUrl = "https://api.neynar.com/v2/siwn/verify";

  const baseBody: Record<string, any> = {};
  if (payload.message) body.message = payload.message;
  if (payload.hash) body.hash = payload.hash;
  if (payload.messageBytes) body.messageBytes = payload.messageBytes;
  body.signature = payload.signature;
  if (NEYNAR_CLIENT_ID) body.client_id = NEYNAR_CLIENT_ID;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "api_key": NEYNAR_API_KEY!,
    "x-neynar-api-key": NEYNAR_API_KEY!,
  };
  if (NEYNAR_CLIENT_ID) headers["x-neynar-client-id"] = NEYNAR_CLIENT_ID;

  // attempt primary endpoint first
  let res = await fetch(primaryUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(baseBody),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok && res.status === 404) {
    // try alternate path
    res = await fetch(fallbackUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(baseBody),
    });
  }

  const json2 = res.ok ? await res.json().catch(() => ({})) : json;

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json2,
    };
  }

  return {
    ok: true,
    data: json2,
  };
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
  // Different orgs return slightly different shapes, so we normalize a bit
  const fid =
    result.data?.fid ??
    result.data?.user?.fid ??
    result.data?.data?.fid ??
    null;
  const username =
    result.data?.username ??
    result.data?.user?.username ??
    result.data?.data?.username ??
    undefined;

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
  } catch (e) {
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

  const fid =
    result.data?.fid ??
    result.data?.user?.fid ??
    result.data?.data?.fid ??
    null;
  const username =
    result.data?.username ??
    result.data?.user?.username ??
    result.data?.data?.username ??
    undefined;

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
