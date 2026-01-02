import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";
const SIGNER_PRIVATE_KEY = process.env.REWARD_SIGNER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// The FID of the app - you need to set NEYNAR_APP_FID env variable
const APP_FID = parseInt(process.env.NEYNAR_APP_FID || "0");

/**
 * Signer Authorization Endpoint
 * Follows the full Neynar Managed Signer flow
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    console.log(`[Signer Auth] Starting for FID ${fid}`);

    // Check for existing approved signer
    const prefsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );
    const prefs = await prefsRes.json() as any[];
    const existingSignerUuid = prefs[0]?.signer_uuid;

    if (existingSignerUuid) {
      const signerRes = await fetch(
        `https://api.neynar.com/v2/farcaster/signer?signer_uuid=${existingSignerUuid}`,
        { headers: { "x-api-key": NEYNAR_API_KEY } }
      );
      
      if (signerRes.ok) {
        const signerData = await signerRes.json() as any;
        console.log(`[Signer Auth] Existing signer status: ${signerData.status}`);
        
        if (signerData.status === "approved") {
          return NextResponse.json({
            success: true,
            signerUuid: existingSignerUuid,
            status: "approved",
            needsApproval: false,
          });
        }
        
        if (signerData.status === "pending_approval" && signerData.signer_approval_url) {
          return NextResponse.json({
            success: true,
            signerUuid: existingSignerUuid,
            approvalUrl: signerData.signer_approval_url,
            status: "pending_approval",
            needsApproval: true,
          });
        }
      }
    }

    // Step 1: Create a new signer
    console.log(`[Signer Auth] Step 1: Creating signer...`);
    const createRes = await fetch("https://api.neynar.com/v2/farcaster/signer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error(`[Signer Auth] Create signer failed:`, err);
      throw new Error("Failed to create signer");
    }

    const signer = await createRes.json() as any;
    console.log(`[Signer Auth] Signer created:`, {
      uuid: signer.signer_uuid,
      publicKey: signer.public_key?.substring(0, 20) + "...",
      status: signer.status,
      hasApprovalUrl: !!signer.signer_approval_url,
    });

    // If we got an approval URL directly, use it
    if (signer.signer_approval_url) {
      await saveSignerUuid(fid, signer.signer_uuid, prefs.length > 0);
      return NextResponse.json({
        success: true,
        signerUuid: signer.signer_uuid,
        approvalUrl: signer.signer_approval_url,
        status: signer.status,
        needsApproval: true,
      });
    }

    // Check if we have the required config for signed key registration
    if (!SIGNER_PRIVATE_KEY) {
      console.error(`[Signer Auth] No SIGNER_PRIVATE_KEY configured`);
      await saveSignerUuid(fid, signer.signer_uuid, prefs.length > 0);
      return NextResponse.json({
        success: false,
        signerUuid: signer.signer_uuid,
        error: "Private key not configured. Please set REWARD_SIGNER_PRIVATE_KEY.",
        needsApproval: true,
      });
    }

    if (!APP_FID || APP_FID === 0) {
      console.error(`[Signer Auth] No NEYNAR_APP_FID configured`);
      await saveSignerUuid(fid, signer.signer_uuid, prefs.length > 0);
      return NextResponse.json({
        success: false,
        signerUuid: signer.signer_uuid,
        error: "App FID not configured. Please set NEYNAR_APP_FID in Vercel.",
        needsApproval: true,
      });
    }

    console.log(`[Signer Auth] Step 2: Signing key request with APP_FID=${APP_FID}...`);
    
    // Create account from private key
    const account = privateKeyToAccount(SIGNER_PRIVATE_KEY as `0x${string}`);
    const deadline = Math.floor(Date.now() / 1000) + 86400; // 24 hours

    // EIP-712 signature for signed key request
    const SIGNED_KEY_REQUEST_VALIDATOR_ADDRESS = "0x00000000FC700472606ED4fA22623Acf62c60553";
    
    const signature = await account.signTypedData({
      domain: {
        name: "Farcaster SignedKeyRequestValidator",
        version: "1",
        chainId: 10, // Optimism
        verifyingContract: SIGNED_KEY_REQUEST_VALIDATOR_ADDRESS,
      },
      types: {
        SignedKeyRequest: [
          { name: "requestFid", type: "uint256" },
          { name: "key", type: "bytes" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "SignedKeyRequest",
      message: {
        requestFid: BigInt(APP_FID),
        key: signer.public_key as `0x${string}`,
        deadline: BigInt(deadline),
      },
    });

    console.log(`[Signer Auth] Step 3: Registering signed key...`);
    
    const registerRes = await fetch("https://api.neynar.com/v2/farcaster/signer/signed_key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        signer_uuid: signer.signer_uuid,
        app_fid: APP_FID,
        deadline,
        signature,
      }),
    });

    if (!registerRes.ok) {
      const err = await registerRes.text();
      console.error(`[Signer Auth] Register signed key failed:`, err);
      throw new Error(`Failed to register signed key: ${err}`);
    }

    const registeredSigner = await registerRes.json() as any;
    console.log(`[Signer Auth] Signed key registered:`, {
      status: registeredSigner.status,
      hasApprovalUrl: !!registeredSigner.signer_approval_url,
      approvalUrl: registeredSigner.signer_approval_url?.substring(0, 50) + "...",
    });

    await saveSignerUuid(fid, signer.signer_uuid, prefs.length > 0);

    if (!registeredSigner.signer_approval_url) {
      throw new Error("No approval URL returned from signed key registration");
    }

    return NextResponse.json({
      success: true,
      signerUuid: signer.signer_uuid,
      approvalUrl: registeredSigner.signer_approval_url,
      status: registeredSigner.status,
      needsApproval: true,
    });
  } catch (error: any) {
    console.error("[Signer Auth] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to authorize signer" },
      { status: 500 }
    );
  }
}

async function saveSignerUuid(fid: number, signerUuid: string, exists: boolean) {
  const updateData = {
    signer_uuid: signerUuid,
    updated_at: new Date().toISOString(),
  };

  if (exists) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}`,
      { method: "PATCH", headers: SUPABASE_HEADERS, body: JSON.stringify(updateData) }
    );
  } else {
    await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences`,
      { method: "POST", headers: SUPABASE_HEADERS, body: JSON.stringify([{ fid, ...updateData }]) }
    );
  }
}