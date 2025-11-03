// src/app/api/siwn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";
import { SiweMessage } from "siwe";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const _NEYNAR_CLIENT_ID = process.env.NEYNAR_CLIENT_ID;

if (!NEYNAR_API_KEY) {
  console.warn("⚠️ NEYNAR_API_KEY is missing in env");
}

// helper: verify SIWN message using SIWE signature verification
// SIWN messages are SIWE (Sign-In With Ethereum) messages that include Farcaster FID in Resources
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

    if (!payload.signature) {
      console.log("[SIWN][VERIFY] no signature provided");
      return {
        ok: false,
        status: 400,
        error: "No signature provided",
      };
    }

    console.log("[SIWN][VERIFY] parsing and verifying SIWE message", {
      messageLength: message?.length,
      messagePreview: message?.substring(0, 100),
    });

    // Parse and verify the SIWE message
    const siweMessage = new SiweMessage(message);
    const verifyResult = await siweMessage.verify({ signature: payload.signature });
    
    if (!verifyResult.success) {
      console.log("[SIWN][VERIFY] SIWE verification failed", {
        error: verifyResult.error,
      });
      return {
        ok: false,
        status: 401,
        error: verifyResult.error?.type || "SIWE signature verification failed",
      };
    }

    // Get the parsed message data
    const fields = siweMessage;

    console.log("[SIWN][VERIFY] SIWE message validated", {
      address: fields.address,
      domain: fields.domain,
      uri: fields.uri,
      nonce: fields.nonce,
      resources: fields.resources,
    });

    // Extract FID from Resources field
    // Resources format: ['- farcaster://fid/318447']
    let fid: number | null = null;
    if (fields.resources && fields.resources.length > 0) {
      for (const resource of fields.resources) {
        // Match patterns like "farcaster://fid/318447" or "- farcaster://fid/318447"
        const fidMatch = resource.toString().match(/farcaster:\/\/fid\/(\d+)/i);
        if (fidMatch && fidMatch[1]) {
          fid = parseInt(fidMatch[1], 10);
          console.log("[SIWN][VERIFY] extracted FID from Resources", { fid, resource });
          break;
        }
      }
    }

    if (!fid) {
      console.log("[SIWN][VERIFY] no FID found in Resources, trying alternative verification");
      
      // Fallback: Try using Neynar's fetchSigners with the verified address
      // This might work for some cases where FID isn't in Resources
      try {
        const client = getNeynarClient();
        // Note: This might not work for SIWN, but worth trying as fallback
        const data = await client.fetchSigners({
          message,
          signature: payload.signature,
        } as any);
        
        if (data.signers && data.signers.length > 0 && data.signers[0].fid) {
          fid = data.signers[0].fid;
          console.log("[SIWN][VERIFY] got FID from fetchSigners fallback", { fid });
        }
      } catch (fallbackError: any) {
        console.log("[SIWN][VERIFY] fetchSigners fallback failed", {
          error: fallbackError?.message,
        });
      }
    }

    if (!fid) {
      console.log("[SIWN][VERIFY] could not extract FID from SIWN message");
      return {
        ok: false,
        status: 400,
        error: "SIWN message verified but no FID found in Resources",
      };
    }

    console.log("[SIWN][VERIFY] success, fetching user data for FID", fid);

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
        address: fields.address, // Include the verified Ethereum address
      },
    };
  } catch (error: any) {
    // Log detailed error info
    const errorDetails: any = {
      message: error?.message || String(error),
      stack: error?.stack,
    };
    
    console.log("[SIWN][VERIFY] verification error", errorDetails);
    
    return {
      ok: false,
      status: 400,
      error: error?.message || "SIWN verification failed",
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
  // result from sdk.actions.signIn() includes nonce, message/hash, and signature
  const message = body.message || body.hash;
  const messageBytes = body.messageBytes || body.message_bytes || body.message_bytes;
  const signature = body.signature;
  const nonce = body.nonce;

  try {
    console.log("[SIWN][POST] body", {
      hasMessage: Boolean(body?.message),
      hasHash: Boolean(body?.hash),
      hasMessageBytes: Boolean(body?.messageBytes || body?.message_bytes),
      hasSignature: Boolean(signature),
      hasNonce: Boolean(nonce),
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

  const result = await verifyWithNeynar({ message, hash: body.hash, messageBytes, signature, nonce });
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
