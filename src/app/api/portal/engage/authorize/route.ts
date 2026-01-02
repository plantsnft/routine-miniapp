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

// Farcaster Signed Key Request EIP-712 Domain (Optimism)
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

    // Check for existing approved signer first
    const prefsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );
    const prefs = (await prefsRes.json()) as any[];
    
    if (prefs[0]?.signer_uuid) {
      // Check if existing signer is approved
      const signerRes = await fetch(
        `https://api.neynar.com/v2/farcaster/signer?signer_uuid=${prefs[0].signer_uuid}`,
        { headers: { "x-api-key": NEYNAR_API_KEY } }
      );
      if (signerRes.ok) {
        const signerData = await signerRes.json() as any;
        console.log(`[Signer Auth] Existing signer status: ${signerData.status}`);
        
        if (signerData.status === "approved") {
          return NextResponse.json({ 
            success: true, 
            signerUuid: prefs[0].signer_uuid, 
            status: "approved", 
            needsApproval: false 
          });
        }
        
        // Return existing pending signer with approval URL
        if (signerData.signer_approval_url || prefs[0].signer_approval_url) {
          return NextResponse.json({ 
            success: true, 
            signerUuid: prefs[0].signer_uuid, 
            approvalUrl: signerData.signer_approval_url || prefs[0].signer_approval_url,
            status: signerData.status, 
            needsApproval: true 
          });
        }
      }
    }

    // Validate required env vars
    if (!FARCASTER_CUSTODY_PRIVATE_KEY) {
      return NextResponse.json({ 
        error: "App not configured: Missing FARCASTER_CUSTODY_PRIVATE_KEY. Create a Farcaster account for your app and add its custody private key.",
        setup: true
      }, { status: 500 });
    }
    if (!NEYNAR_APP_FID) {
      return NextResponse.json({ 
        error: "App not configured: Missing NEYNAR_APP_FID. Add the FID of your app's Farcaster account.",
        setup: true
      }, { status: 500 });
    }

    const appFid = parseInt(NEYNAR_APP_FID, 10);
    console.log(`[Signer Auth] Using App FID: ${appFid}`);

    // Derive account from private key
    const pk = FARCASTER_CUSTODY_PRIVATE_KEY.startsWith("0x") 
      ? FARCASTER_CUSTODY_PRIVATE_KEY 
      : `0x${FARCASTER_CUSTODY_PRIVATE_KEY}`;
    const account = privateKeyToAccount(pk as `0x${string}`);
    console.log(`[Signer Auth] App custody address: ${account.address}`);

    // Verify the custody address matches the app FID
    const userRes = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${appFid}`,
      { headers: { "x-api-key": NEYNAR_API_KEY } }
    );
    if (userRes.ok) {
      const userData = await userRes.json() as any;
      const expectedCustody = userData.users?.[0]?.custody_address;
      if (expectedCustody && account.address.toLowerCase() !== expectedCustody.toLowerCase()) {
        console.error(`[Signer Auth] Custody mismatch: got ${account.address}, expected ${expectedCustody}`);
        return NextResponse.json({ 
          error: `Custody address mismatch. Your key generates ${account.address} but FID ${appFid} has custody ${expectedCustody}`,
          setup: true
        }, { status: 500 });
      }
      console.log(`[Signer Auth] Custody address verified for FID ${appFid}`);
    }

    // Step 1: Create a new signer
    console.log(`[Signer Auth] Creating signer...`);
    const createRes = await fetch("https://api.neynar.com/v2/farcaster/signer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": NEYNAR_API_KEY },
    });
    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create signer: ${errText}`);
    }
    const signer = await createRes.json() as any;
    console.log(`[Signer Auth] Signer created: ${signer.signer_uuid}`);

    // Step 2: Sign the key request with EIP-712
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24 hours
    console.log(`[Signer Auth] Signing request for FID ${appFid}, deadline ${deadline}`);
    
    const signature = await account.signTypedData({
      domain: SIGNED_KEY_REQUEST_DOMAIN,
      types: SIGNED_KEY_REQUEST_TYPES,
      primaryType: "SignedKeyRequest",
      message: { 
        requestFid: BigInt(appFid), 
        key: signer.public_key as `0x${string}`, 
        deadline 
      },
    });
    console.log(`[Signer Auth] Signature generated`);

    // Step 3: Register signed key with Neynar sponsorship
    console.log(`[Signer Auth] Registering with Neynar sponsorship...`);
    const registerRes = await fetch("https://api.neynar.com/v2/farcaster/signer/signed_key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": NEYNAR_API_KEY },
      body: JSON.stringify({
        signer_uuid: signer.signer_uuid,
        app_fid: appFid,
        deadline: Number(deadline),
        signature: signature,
        sponsor: { sponsored_by_neynar: true } // Neynar pays, users don't
      }),
    });
    
    const registerText = await registerRes.text();
    console.log(`[Signer Auth] Register response: ${registerRes.status}`);
    
    if (!registerRes.ok) {
      throw new Error(`Failed to register: ${registerText}`);
    }
    
    const registered = JSON.parse(registerText) as any;
    console.log(`[Signer Auth] Registered: status=${registered.status}, hasUrl=${!!registered.signer_approval_url}`);
    
    if (!registered.signer_approval_url) {
      throw new Error("No approval URL returned from Neynar");
    }

    // Save to database
    const data = { 
      signer_uuid: signer.signer_uuid, 
      signer_approval_url: registered.signer_approval_url, 
      updated_at: new Date().toISOString() 
    };
    
    if (prefs.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}`, { 
        method: "PATCH", 
        headers: SUPABASE_HEADERS, 
        body: JSON.stringify(data) 
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/user_engage_preferences`, { 
        method: "POST", 
        headers: SUPABASE_HEADERS, 
        body: JSON.stringify([{ fid, ...data }]) 
      });
    }

    console.log(`[Signer Auth] Success! User needs to approve at: ${registered.signer_approval_url}`);

    return NextResponse.json({ 
      success: true, 
      signerUuid: signer.signer_uuid, 
      approvalUrl: registered.signer_approval_url, 
      status: registered.status, 
      needsApproval: true 
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Signer Auth] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
