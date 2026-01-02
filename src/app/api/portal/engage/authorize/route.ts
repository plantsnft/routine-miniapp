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
 * Uses Neynar's managed signer with sponsored flow
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    console.log(`[Signer Auth] Starting for FID ${fid}`);

    // Check for existing signer
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
        console.log(`[Signer Auth] Existing signer:`, {
          status: signerData.status,
          hasApprovalUrl: !!signerData.signer_approval_url,
        });
        
        if (signerData.status === "approved") {
          return NextResponse.json({
            success: true,
            signerUuid: existingSignerUuid,
            status: "approved",
            needsApproval: false,
          });
        }
        
        // If pending approval and has URL, return it
        if (signerData.signer_approval_url) {
          return NextResponse.json({
            success: true,
            signerUuid: existingSignerUuid,
            approvalUrl: signerData.signer_approval_url,
            status: signerData.status,
            needsApproval: true,
          });
        }
      }
    }

    // Try creating a sponsored signer - this should return an approval URL
    console.log(`[Signer Auth] Creating sponsored signer...`);
    
    const createRes = await fetch("https://api.neynar.com/v2/farcaster/signer/developer_managed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        sponsor: true, // Request Neynar to sponsor this signer
      }),
    });

    let signer: any;
    
    if (createRes.ok) {
      signer = await createRes.json();
      console.log(`[Signer Auth] Developer managed signer created:`, {
        uuid: signer.signer_uuid,
        status: signer.status,
        hasApprovalUrl: !!signer.signer_approval_url,
        publicKey: signer.public_key?.substring(0, 20),
      });
    } else {
      // Fallback to regular signer endpoint
      console.log(`[Signer Auth] Developer managed failed, trying regular signer...`);
      const regularRes = await fetch("https://api.neynar.com/v2/farcaster/signer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": NEYNAR_API_KEY,
        },
      });
      
      if (!regularRes.ok) {
        const err = await regularRes.text();
        throw new Error(`Failed to create signer: ${err}`);
      }
      
      signer = await regularRes.json();
      console.log(`[Signer Auth] Regular signer created:`, {
        uuid: signer.signer_uuid,
        status: signer.status,
        hasApprovalUrl: !!signer.signer_approval_url,
      });
    }

    // Save signer UUID
    await saveSignerUuid(fid, signer.signer_uuid, prefs.length > 0);

    // Check if we got an approval URL
    if (signer.signer_approval_url) {
      console.log(`[Signer Auth] Got approval URL:`, signer.signer_approval_url.substring(0, 50));
      return NextResponse.json({
        success: true,
        signerUuid: signer.signer_uuid,
        approvalUrl: signer.signer_approval_url,
        status: signer.status,
        needsApproval: true,
      });
    }

    // If no approval URL, the signer might be auto-approved (sponsored)
    if (signer.status === "approved") {
      // Update preferences to enable auto-engage
      await fetch(
        `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}`,
        {
          method: "PATCH",
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            auto_engage_enabled: true,
            bonus_multiplier: 1.1,
          }),
        }
      );
      
      return NextResponse.json({
        success: true,
        signerUuid: signer.signer_uuid,
        status: "approved",
        needsApproval: false,
        message: "Signer is auto-approved (sponsored)",
      });
    }

    // Signer created but no approval URL - need manual intervention
    console.log(`[Signer Auth] Signer created but no approval URL. Status: ${signer.status}`);
    
    return NextResponse.json({
      success: false,
      signerUuid: signer.signer_uuid,
      status: signer.status,
      needsApproval: true,
      error: "Signer created but no approval URL available. Your Neynar app may need to be configured for managed signers.",
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