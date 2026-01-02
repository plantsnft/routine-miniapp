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

/**
 * Signer Authorization Endpoint
 * POST /api/portal/engage/authorize
 * 
 * This endpoint handles the full signer authorization flow:
 * 1. Check if user has an existing signer
 * 2. If signer exists and is approved - return success
 * 3. If signer exists but not approved - create a new signer
 * 4. If no signer - create a new signer
 * 
 * Returns: { signerUuid, approvalUrl, status, needsApproval }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    console.log(`[Signer Auth] Starting authorization for FID ${fid}`);

    // Check if user has existing signer in preferences
    const prefsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );
    
    const prefs = await prefsRes.json() as any[];
    const existingSignerUuid = prefs[0]?.signer_uuid;

    // If existing signer, check its status
    if (existingSignerUuid) {
      console.log(`[Signer Auth] Found existing signer: ${existingSignerUuid}`);
      
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
            message: "Signer is already approved",
          });
        }
        
        // Signer exists but not approved - we need a new one with fresh approval URL
        console.log(`[Signer Auth] Existing signer not approved, creating new one...`);
      }
    }

    // Create a new signer to get a fresh approval URL
    console.log(`[Signer Auth] Creating new signer...`);
    
    const neynarClient = getNeynarClient();
    const newSigner = await neynarClient.createSigner();
    
    console.log(`[Signer Auth] New signer created:`, {
      uuid: newSigner.signer_uuid,
      status: newSigner.status,
      hasApprovalUrl: !!newSigner.signer_approval_url,
    });

    if (!newSigner.signer_uuid) {
      throw new Error("Failed to create signer - no UUID returned");
    }

    if (!newSigner.signer_approval_url) {
      throw new Error("Failed to create signer - no approval URL returned");
    }

    // Save the new signer UUID to preferences
    const updateData = {
      signer_uuid: newSigner.signer_uuid,
      updated_at: new Date().toISOString(),
    };

    if (prefs.length > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}`,
        {
          method: "PATCH",
          headers: SUPABASE_HEADERS,
          body: JSON.stringify(updateData),
        }
      );
    } else {
      await fetch(
        `${SUPABASE_URL}/rest/v1/user_engage_preferences`,
        {
          method: "POST",
          headers: SUPABASE_HEADERS,
          body: JSON.stringify([{ fid, ...updateData }]),
        }
      );
    }

    console.log(`[Signer Auth] Signer saved, returning approval URL`);

    return NextResponse.json({
      success: true,
      signerUuid: newSigner.signer_uuid,
      approvalUrl: newSigner.signer_approval_url,
      status: newSigner.status,
      needsApproval: true,
      message: "Please approve the signer in Warpcast",
    });
  } catch (error: any) {
    console.error("[Signer Auth] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to authorize signer" },
      { status: 500 }
    );
  }
}