import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { getNeynarClient } from "~/lib/neynar";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const FARCASTER_CUSTODY_PRIVATE_KEY = process.env.FARCASTER_CUSTODY_PRIVATE_KEY || "";
const NEYNAR_APP_FID = process.env.NEYNAR_APP_FID || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

const SIGNED_KEY_REQUEST_DOMAIN = {
  name: "Farcaster SignedKeyRequestValidator",
  version: "1",
  chainId: 10,
  verifyingContract: "0x00000000FC700472606ED4fA22623Acf62c60553" as `0x${string}`,
} as const;

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
    if (!fid) return NextResponse.json({ error: "fid required" }, { status: 400 });

    console.log(`[Signer Auth] Starting for FID ${fid}`);
    if (!FARCASTER_CUSTODY_PRIVATE_KEY) return NextResponse.json({ error: "FARCASTER_CUSTODY_PRIVATE_KEY not set" }, { status: 500 });
    if (!NEYNAR_APP_FID) return NextResponse.json({ error: "NEYNAR_APP_FID not set" }, { status: 500 });

    const appFid = parseInt(NEYNAR_APP_FID, 10);
    const neynarClient = getNeynarClient();

    // Check existing signer
    const prefsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`, { method: "GET", headers: SUPABASE_HEADERS });
    const prefs = (await prefsRes.json()) as any[];
    if (prefs[0]?.signer_uuid) {
      try {
        const existing = await neynarClient.lookupSigner({ signerUuid: prefs[0].signer_uuid });
        if (existing.status === "approved") return NextResponse.json({ success: true, signerUuid: prefs[0].signer_uuid, status: "approved", needsApproval: false });
        if (existing.signer_approval_url) return NextResponse.json({ success: true, signerUuid: prefs[0].signer_uuid, approvalUrl: existing.signer_approval_url, status: existing.status, needsApproval: true });
      } catch (e) { console.log("[Signer Auth] Existing signer lookup failed"); }
    }

    // Create signer
    console.log("[Signer Auth] Creating signer...");
    const signer = await neynarClient.createSigner();
    console.log(`[Signer Auth] Signer: ${signer.signer_uuid}`);

    // Sign with EIP-712
    const pk = FARCASTER_CUSTODY_PRIVATE_KEY.startsWith("0x") ? FARCASTER_CUSTODY_PRIVATE_KEY : `0x${FARCASTER_CUSTODY_PRIVATE_KEY}`;
    const account = privateKeyToAccount(pk as `0x${string}`);
    console.log(`[Signer Auth] Address: ${account.address}`);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
    const signature = await account.signTypedData({
      domain: SIGNED_KEY_REQUEST_DOMAIN,
      types: SIGNED_KEY_REQUEST_TYPES,
      primaryType: "SignedKeyRequest",
      message: { requestFid: BigInt(appFid), key: signer.public_key as `0x${string}`, deadline },
    });
    console.log("[Signer Auth] Signature generated");

    // Register signed key
    console.log("[Signer Auth] Registering...");
    const registered = await neynarClient.registerSignedKey({ signerUuid: signer.signer_uuid, appFid, deadline: Number(deadline), signature });
    console.log(`[Signer Auth] Done: ${registered.status}, url=${!!registered.signer_approval_url}`);

    if (!registered.signer_approval_url) throw new Error("No approval URL");

    // Save
    const data = { signer_uuid: signer.signer_uuid, signer_approval_url: registered.signer_approval_url, updated_at: new Date().toISOString() };
    if (prefs.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}`, { method: "PATCH", headers: SUPABASE_HEADERS, body: JSON.stringify(data) });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/user_engage_preferences`, { method: "POST", headers: SUPABASE_HEADERS, body: JSON.stringify([{ fid, ...data }]) });
    }

    return NextResponse.json({ success: true, signerUuid: signer.signer_uuid, approvalUrl: registered.signer_approval_url, status: registered.status, needsApproval: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Signer Auth] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
