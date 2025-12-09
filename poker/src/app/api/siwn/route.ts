import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";
import { SiweMessage } from "siwe";
import type { SiwnResponse } from "~/lib/types";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

if (!NEYNAR_API_KEY) {
  console.warn("⚠️ NEYNAR_API_KEY is missing in env");
}

async function verifyWithNeynar(payload: {
  message?: string;
  hash?: string;
  messageBytes?: string;
  signature: string;
  nonce?: string;
}) {
  console.log("[SIWN][VERIFY] starting verification", {
    hasMessage: Boolean(payload.message),
    hasHash: Boolean(payload.hash),
    hasMessageBytes: Boolean(payload.messageBytes),
    hasSignature: Boolean(payload.signature),
  });

  try {
    const message = payload.message || payload.hash || payload.messageBytes;
    
    if (!message) {
      return {
        ok: false,
        status: 400,
        error: "No message, hash, or messageBytes provided",
      };
    }

    if (!payload.signature) {
      return {
        ok: false,
        status: 400,
        error: "No signature provided",
      };
    }

    const siweMessage = new SiweMessage(message);
    const verifyResult = await siweMessage.verify({ signature: payload.signature });
    
    if (!verifyResult.success) {
      return {
        ok: false,
        status: 401,
        error: verifyResult.error?.type || "SIWE signature verification failed",
      };
    }

    const fields = siweMessage;

    // Extract FID from Resources field
    let fid: number | null = null;
    if (fields.resources && fields.resources.length > 0) {
      for (const resource of fields.resources) {
        const fidMatch = resource.toString().match(/farcaster:\/\/fid\/(\d+)/i);
        if (fidMatch && fidMatch[1]) {
          fid = parseInt(fidMatch[1], 10);
          break;
        }
      }
    }

    if (!fid) {
      // Fallback: Try Neynar fetchSigners
      try {
        const client = getNeynarClient();
        const data = await client.fetchSigners({
          message,
          signature: payload.signature,
        } as any);
        
        if (data.signers && data.signers.length > 0 && data.signers[0].fid) {
          fid = data.signers[0].fid;
        }
      } catch (fallbackError: any) {
        console.log("[SIWN][VERIFY] fetchSigners fallback failed", {
          error: fallbackError?.message,
        });
      }
    }

    if (!fid) {
      return {
        ok: false,
        status: 400,
        error: "SIWN message verified but no FID found in Resources",
      };
    }

    // Fetch full user data from Neynar
    const client = getNeynarClient();
    const { users } = await client.fetchBulkUsers({ fids: [fid] });
    const user = users[0] || null;

    return {
      ok: true,
      data: {
        fid,
        username: user?.username,
        user,
        address: fields.address,
      },
    };
  } catch (error: any) {
    console.log("[SIWN][VERIFY] verification error", {
      message: error?.message || String(error),
    });
    
    return {
      ok: false,
      status: 400,
      error: error?.message || "SIWN verification failed",
    };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const message = searchParams.get("message");
  const signature = searchParams.get("signature");
  const hash = searchParams.get("hash");
  const fidFromHost = searchParams.get("fid");

  if (fidFromHost) {
    return NextResponse.json<SiwnResponse>({
      ok: true,
      fid: Number(fidFromHost),
      username: undefined,
    });
  }

  if (!message && !signature && !hash) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: "No SIWN params found in URL.",
      },
      { status: 400 }
    );
  }

  const finalMessage = message || hash;
  const finalSignature = signature;

  if (!finalMessage || !finalSignature) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: "Got hash/signature but one of them is missing (need both).",
      },
      { status: 400 }
    );
  }

  const result = await verifyWithNeynar({ message: finalMessage, signature: finalSignature });

  if (!result.ok) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: result.error || "Neynar error in SIWN GET.",
      },
      { status: result.status || 400 }
    );
  }

  const fid = result.data?.fid ?? result.data?.user?.fid ?? null;
  const username = result.data?.username ?? result.data?.user?.username ?? undefined;

  if (!fid) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: "SIWN verified but no FID was returned from Neynar.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json<SiwnResponse>({
    ok: true,
    fid: Number(fid),
    username,
  });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch (_e) {
    return NextResponse.json<SiwnResponse>(
      { ok: false, error: "Body was not JSON" },
      { status: 400 }
    );
  }

  const message = body.message || body.hash;
  const messageBytes = body.messageBytes || body.message_bytes;
  const signature = body.signature;
  const nonce = body.nonce;

  if (body.fid) {
    return NextResponse.json<SiwnResponse>({
      ok: true,
      fid: Number(body.fid),
      username: body.username ?? undefined,
    });
  }

  if ((!message && !messageBytes) || !signature) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: "No message/hash/messageBytes and signature in request body.",
      },
      { status: 400 }
    );
  }

  const result = await verifyWithNeynar({ message, hash: body.hash, messageBytes, signature, nonce });

  if (!result.ok) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: result.error || "Neynar error in SIWN POST.",
      },
      { status: result.status || 400 }
    );
  }

  const fid = result.data?.fid ?? result.data?.user?.fid ?? null;
  const username = result.data?.username ?? result.data?.user?.username ?? undefined;

  if (!fid) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: "SIWN verified but no FID was returned from Neynar.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json<SiwnResponse>({
    ok: true,
    fid: Number(fid),
    username,
  });
}
