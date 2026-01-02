import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { fid?: number };
    const { fid } = body;
    if (!fid) return NextResponse.json({ error: "fid required" }, { status: 400 });

    console.log(`[Signer Auth] Starting for user FID ${fid}`);
    
    const neynarClient = getNeynarClient();

    // Check existing signer
    const prefsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`, { method: "GET", headers: SUPABASE_HEADERS });
    const prefs = (await prefsRes.json()) as any[];
    
    if (prefs[0]?.signer_uuid) {
      try {
        const existing = await neynarClient.lookupSigner({ signerUuid: prefs[0].signer_uuid });
        console.log(`[Signer Auth] Existing signer status: ${existing.status}`);
        
        if (existing.status === "approved") {
          return NextResponse.json({ success: true, signerUuid: prefs[0].signer_uuid, status: "approved", needsApproval: false });
        }
        if (existing.signer_approval_url) {
          return NextResponse.json({ success: true, signerUuid: prefs[0].signer_uuid, approvalUrl: existing.signer_approval_url, status: existing.status, needsApproval: true });
        }
      } catch (e) { 
        console.log("[Signer Auth] Existing signer lookup failed, creating new..."); 
      }
    }

    // Create signer
    console.log("[Signer Auth] Creating signer...");
    const signer = await neynarClient.createSigner();
    console.log(`[Signer Auth] Signer created: ${signer.signer_uuid}`);

    // Register with Neynar sponsorship - NO private key or FID needed!
    console.log("[Signer Auth] Registering with Neynar sponsorship...");
    const registered = await neynarClient.registerSignedKey({
      signerUuid: signer.signer_uuid,
      appFid: 0, // Will be ignored when sponsored_by_neynar is true
      deadline: Math.floor(Date.now() / 1000) + 86400,
      signature: "0x", // Will be ignored when sponsored_by_neynar is true
      sponsor: { sponsored_by_neynar: true }
    });
    
    console.log(`[Signer Auth] Result: status=${registered.status}, hasUrl=${!!registered.signer_approval_url}`);

    if (!registered.signer_approval_url) {
      throw new Error("No approval URL returned from Neynar");
    }

    // Save to DB
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

    console.log(`[Signer Auth] Success! Approval URL: ${registered.signer_approval_url.substring(0, 60)}...`);

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
