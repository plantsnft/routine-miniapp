import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

/**
 * Signer Authorization Endpoint
 * POST /api/portal/engage/authorize
 * 
 * Creates a managed signer using the Neynar API directly
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    console.log(`[Signer Auth] Starting authorization for FID ${fid}`);

    // Check if user has existing approved signer
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
      }
    }

    // Create a new signer using the Neynar API directly
    console.log(`[Signer Auth] Creating new managed signer via API...`);
    
    const createRes = await fetch("https://api.neynar.com/v2/farcaster/signer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error(`[Signer Auth] Create signer failed:`, errorText);
      throw new Error("Failed to create signer");
    }

    const newSigner = await createRes.json() as any;
    
    console.log(`[Signer Auth] Signer created:`, JSON.stringify(newSigner, null, 2));

    // Check if we got an approval URL
    const approvalUrl = newSigner.signer_approval_url;
    
    if (!approvalUrl) {
      // For sponsored signers, we might not get an approval URL
      // The signer might already be usable or need a different flow
      console.log(`[Signer Auth] No approval URL - checking signer status...`);
      
      // If signer is already approved (sponsored), we can use it
      if (newSigner.status === "approved") {
        // Save and return
        const updateData = {
          signer_uuid: newSigner.signer_uuid,
          auto_engage_enabled: true,
          bonus_multiplier: 1.1,
          updated_at: new Date().toISOString(),
        };

        if (prefs.length > 0) {
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

        return NextResponse.json({
          success: true,
          signerUuid: newSigner.signer_uuid,
          status: "approved",
          needsApproval: false,
          message: "Signer is approved (sponsored)",
        });
      }

      // For managed signers, we need to use the signed key request flow
      // This requires the user to sign a message in Warpcast
      console.log(`[Signer Auth] Attempting signed key request flow...`);
      
      // Generate a signed key request URL using Warpcast deep link
      const publicKey = newSigner.public_key;
      const deadline = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
      
      // Create a Warpcast deep link for signing
      const warpcastUrl = `https://warpcast.com/~/add-signer?publicKey=${publicKey}&name=Catwalk%20Auto-Engage&deadline=${deadline}`;
      
      console.log(`[Signer Auth] Generated Warpcast URL: ${warpcastUrl}`);

      // Save the signer UUID
      const updateData = {
        signer_uuid: newSigner.signer_uuid,
        updated_at: new Date().toISOString(),
      };

      if (prefs.length > 0) {
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

      return NextResponse.json({
        success: true,
        signerUuid: newSigner.signer_uuid,
        approvalUrl: warpcastUrl,
        status: newSigner.status,
        needsApproval: true,
        message: "Please authorize in Warpcast",
      });
    }

    // Save the new signer UUID
    const updateData = {
      signer_uuid: newSigner.signer_uuid,
      updated_at: new Date().toISOString(),
    };

    if (prefs.length > 0) {
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

    console.log(`[Signer Auth] Returning approval URL: ${approvalUrl}`);

    return NextResponse.json({
      success: true,
      signerUuid: newSigner.signer_uuid,
      approvalUrl: approvalUrl,
      status: newSigner.status,
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