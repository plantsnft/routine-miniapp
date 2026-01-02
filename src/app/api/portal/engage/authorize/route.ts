import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { getNeynarClient } from "~/lib/neynar";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const FARCASTER_CUSTODY_PRIVATE_KEY = process.env.FARCASTER_CUSTODY_PRIVATE_KEY || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

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

    console.log(`[Signer Auth] Starting for user FID ${fid}`);
    if (!FARCASTER_CUSTODY_PRIVATE_KEY) return NextResponse.json({ error: "FARCASTER_CUSTODY_PRIVATE_KEY not set" }, { status: 500 });

    // Get the address from the private key
    const pk = FARCASTER_CUSTODY_PRIVATE_KEY.startsWith("0x") ? FARCASTER_CUSTODY_PRIVATE_KEY : `0x${FARCASTER_CUSTODY_PRIVATE_KEY}`;
    const account = privateKeyToAccount(pk as `0x${string}`);
    console.log(`[Signer Auth] Private key generates address: ${account.address}`);
    
    // Look up what FID this address owns (custody of)
    const custodyLookup = await fetch(`https://api.neynar.com/v2/farcaster/user/by_verification?address=${account.address}`, {
      headers: { "x-api-key": NEYNAR_API_KEY }
    });
    
    let appFid: number | null = null;
    
    if (custodyLookup.ok) {
      const custodyData = await custodyLookup.json() as any;
      // Check if any user has this as custody address
      for (const user of custodyData.users || []) {
        if (user.custody_address?.toLowerCase() === account.address.toLowerCase()) {
          appFid = user.fid;
          console.log(`[Signer Auth] Found FID ${appFid} with custody address ${account.address}`);
          break;
        }
      }
    }
    
    // If not found via verification, try direct lookup by custody address
    if (!appFid) {
      const bulkLookup = await fetch(`https://api.neynar.com/v2/farcaster/user/custody-address?custody_address=${account.address}`, {
        headers: { "x-api-key": NEYNAR_API_KEY }
      });
      if (bulkLookup.ok) {
        const bulkData = await bulkLookup.json() as any;
        if (bulkData.user?.fid) {
          appFid = bulkData.user.fid;
          console.log(`[Signer Auth] Found FID ${appFid} via custody lookup`);
        }
      }
    }
    
    if (!appFid) {
      console.log(`[Signer Auth] No FID found for address ${account.address}`);
      return NextResponse.json({ 
        error: `No Farcaster account found with custody address ${account.address}. You may need to register a Farcaster account with this wallet, or add it as a verified address to your existing account.`,
        details: {
          yourPrivateKeyAddress: account.address,
          suggestion: "Register a new Farcaster account using this wallet, or transfer your FID custody to this address"
        }
      }, { status: 400 });
    }
    
    console.log(`[Signer Auth] Using App FID: ${appFid} (from custody address ${account.address})`);
    
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
    console.log(`[Signer Auth] Signer: ${signer.signer_uuid}, pubKey: ${signer.public_key.substring(0, 20)}...`);

    // Sign with EIP-712 using the FID that matches our custody address
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
    console.log(`[Signer Auth] Signing: requestFid=${appFid}, deadline=${deadline}`);
    
    const signature = await account.signTypedData({
      domain: SIGNED_KEY_REQUEST_DOMAIN,
      types: SIGNED_KEY_REQUEST_TYPES,
      primaryType: "SignedKeyRequest",
      message: { requestFid: BigInt(appFid), key: signer.public_key as `0x${string}`, deadline },
    });
    console.log(`[Signer Auth] Signature generated`);

    // Register signed key
    console.log("[Signer Auth] Registering signed key...");
    const registered = await neynarClient.registerSignedKey({ signerUuid: signer.signer_uuid, appFid, deadline: Number(deadline), signature });
    console.log(`[Signer Auth] Result: status=${registered.status}, hasUrl=${!!registered.signer_approval_url}`);

    if (!registered.signer_approval_url) throw new Error("No approval URL returned");

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
