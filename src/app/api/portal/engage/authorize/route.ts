import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";
const FARCASTER_CUSTODY_PRIVATE_KEY = process.env.FARCASTER_CUSTODY_PRIVATE_KEY || "";
const NEYNAR_APP_FID = process.env.NEYNAR_APP_FID || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// Farcaster Signed Key Request EIP-712 Domain (on Optimism)
const SIGNED_KEY_REQUEST_DOMAIN = {
  name: "Farcaster SignedKeyRequestValidator",
  version: "1",
  chainId: 10,
  verifyingContract: "0x00000000FC700472606ED4fA22623Acf62c60553" as `0x${string}`,
} as const;

// Farcaster Signed Key Request EIP-712 Types
const SIGNED_KEY_REQUEST_TYPES = {
  SignedKeyRequest: [
    { name: "requestFid", type: "uint256" },
    { name: "key", type: "bytes" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { fid?: number };
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    console.log(`[Signer Auth] Starting for FID ${fid}`);

    if (!FARCASTER_CUSTODY_PRIVATE_KEY) {
      return NextResponse.json({ error: "App signer private key not configured" }, { status: 500 });
    }

    if (!NEYNAR_APP_FID) {
      return NextResponse.json({ error: "App FID not configured. Add NEYNAR_APP_FID to env vars." }, { status: 500 });
    }

    const appFid = parseInt(NEYNAR_APP_FID, 10);
    console.log(`[Signer Auth] Using App FID: ${appFid}`);

    // Check existing signer
    const prefsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );
    const prefs = (await prefsRes.json()) as any[];
    const existingSignerUuid = prefs[0]?.signer_uuid;
    const existingApprovalUrl = prefs[0]?.signer_approval_url;

    if (existingSignerUuid) {
      const signerRes = await fetch(
        `https://api.neynar.com/v2/farcaster/signer?signer_uuid=${existingSignerUuid}`,
        { headers: { "x-api-key": NEYNAR_API_KEY } }
      );
      if (signerRes.ok) {
        const signerData = await signerRes.json() as any;
        console.log(`[Signer Auth] Existing signer status: ${signerData.status}`);
        if (signerData.status === "approved") {
          return NextResponse.json({ success: true, signerUuid: existingSignerUuid, status: "approved", needsApproval: false });
        }
        const approvalUrl = signerData.signer_approval_url || existingApprovalUrl;
        if (approvalUrl) {
          return NextResponse.json({ success: true, signerUuid: existingSignerUuid, approvalUrl, status: signerData.status, needsApproval: true });
        }
      }
    }

    // Step 1: Create signer
    console.log(`[Signer Auth] Step 1: Creating signer...`);
    const createRes = await fetch("https://api.neynar.com/v2/farcaster/signer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": NEYNAR_API_KEY },
    });
    if (!createRes.ok) throw new Error(`Failed to create signer: ${await createRes.text()}`);
    const signer = await createRes.json() as any;
    console.log(`[Signer Auth] Signer created: uuid=${signer.signer_uuid}`);

    // Step 2: Sign with EIP-712
    console.log(`[Signer Auth] Step 2: Signing key request...`);
    const privateKey = FARCASTER_CUSTODY_PRIVATE_KEY.startsWith("0x") ? FARCASTER_CUSTODY_PRIVATE_KEY : `0x${FARCASTER_CUSTODY_PRIVATE_KEY}`;
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    console.log(`[Signer Auth] Signing with address: ${account.address}`);
    
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
    const signature = await account.signTypedData({
      domain: SIGNED_KEY_REQUEST_DOMAIN,
      types: SIGNED_KEY_REQUEST_TYPES,
      primaryType: "SignedKeyRequest",
      message: { requestFid: BigInt(appFid), key: signer.public_key as `0x${string}`, deadline },
    });
    console.log(`[Signer Auth] Signature generated`);

    // Step 3: Register signed key
    console.log(`[Signer Auth] Step 3: Registering signed key...`);
    const registerRes = await fetch("https://api.neynar.com/v2/farcaster/signer/signed_key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": NEYNAR_API_KEY },
      body: JSON.stringify({ signer_uuid: signer.signer_uuid, app_fid: appFid, deadline: Number(deadline), signature }),
    });
    if (!registerRes.ok) throw new Error(`Failed to register signed key: ${await registerRes.text()}`);
    
    const registered = await registerRes.json() as any;
    console.log(`[Signer Auth] Registered: status=${registered.status}, hasUrl=${!!registered.signer_approval_url}`);
    
    if (!registered.signer_approval_url) throw new Error("No approval URL returned");

    // Save to DB
    const updateData = { signer_uuid: signer.signer_uuid, signer_approval_url: registered.signer_approval_url, updated_at: new Date().toISOString() };
    if (prefs.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}`, { method: "PATCH", headers: SUPABASE_HEADERS, body: JSON.stringify(updateData) });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/user_engage_preferences`, { method: "POST", headers: SUPABASE_HEADERS, body: JSON.stringify([{ fid, ...updateData }]) });
    }

    return NextResponse.json({ success: true, signerUuid: signer.signer_uuid, approvalUrl: registered.signer_approval_url, status: registered.status, needsApproval: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Signer Auth] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
