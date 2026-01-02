import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

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

    // Register with Neynar sponsorship using direct API call
    console.log("[Signer Auth] Registering with Neynar sponsorship...");
    const registerRes = await fetch("https://api.neynar.com/v2/farcaster/signer/signed_key", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "x-api-key": NEYNAR_API_KEY 
      },
      body: JSON.stringify({
        signer_uuid: signer.signer_uuid,
        sponsor: { sponsored_by_neynar: true }
      }),
    });
    
    const registerText = await registerRes.text();
    console.log(`[Signer Auth] Neynar response: ${registerRes.status} - ${registerText}`);
    
    if (!registerRes.ok) {
      throw new Error(`Neynar API error: ${registerRes.status} - ${registerText}`);
    }
    
    const registered = JSON.parse(registerText) as any;
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

    console.log(`[Signer Auth] Success!`);

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
