import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";
import { SiweMessage } from "siwe";

export interface SiwnResponse {
  ok: boolean;
  fid?: number;
  username?: string;
  error?: string;
}

async function verifyWithNeynar(payload: {
  message?: string;
  hash?: string;
  messageBytes?: string;
  signature: string;
  nonce?: string;
}): Promise<{ ok: boolean; data?: { fid?: number; user?: { fid?: number } }; error?: string; status?: number }> {
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

    // Parse and verify the SIWE message
    const siweMessage = new SiweMessage(message);
    const verifyResult = await siweMessage.verify({ signature: payload.signature });
    
    if (!verifyResult.success) {
      return {
        ok: false,
        status: 401,
        error: verifyResult.error?.type || "SIWE signature verification failed",
      };
    }

    // Extract FID from Resources field
    let fid: number | null = null;
    const fields = siweMessage;
    if (fields.resources && fields.resources.length > 0) {
      for (const resource of fields.resources) {
        if (typeof resource === "string" && resource.startsWith("farcaster://fid/")) {
          const fidStr = resource.replace("farcaster://fid/", "");
          fid = parseInt(fidStr, 10);
          break;
        }
      }
    }

    if (!fid) {
      return {
        ok: false,
        status: 400,
        error: "FID not found in SIWE message resources",
      };
    }

    return {
      ok: true,
      data: { fid },
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message || body.hash;
    const messageBytes = body.messageBytes || body.message_bytes;
    const signature = body.signature;
    const nonce = body.nonce;

    // If fid is sent directly, return it
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

    if (!fid) {
      return NextResponse.json<SiwnResponse>(
        {
          ok: false,
          error: "FID not found in verification result",
        },
        { status: 400 }
      );
    }

    return NextResponse.json<SiwnResponse>({
      ok: true,
      fid: Number(fid),
    });
  } catch (error) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : "SIWN verification failed",
      },
      { status: 500 }
    );
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
        error: result.error || "SIWN verification failed",
      },
      { status: result.status || 400 }
    );
  }

  const fid = result.data?.fid ?? result.data?.user?.fid ?? null;

  if (!fid) {
    return NextResponse.json<SiwnResponse>(
      {
        ok: false,
        error: "FID not found in verification result",
      },
      { status: 400 }
    );
  }

  return NextResponse.json<SiwnResponse>({
    ok: true,
    fid: Number(fid),
  });
}
