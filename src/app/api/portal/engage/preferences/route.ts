import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

/**
 * Get user engagement preferences
 * GET /api/portal/engage/preferences?fid=123
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get("fid");

    if (!fid) {
      return NextResponse.json(
        { error: "fid is required" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    if (!res.ok) {
      throw new Error("Failed to fetch preferences");
    }

    const data = await res.json() as any[];
    
    if (data.length === 0) {
      // Return default preferences
      return NextResponse.json({
        fid: parseInt(fid),
        signerUuid: null,
        autoEngageEnabled: false,
        bonusMultiplier: 1.0,
        hasValidSigner: false,
      });
    }

    const prefs = data[0];
    return NextResponse.json({
      fid: prefs.fid,
      signerUuid: prefs.signer_uuid,
      autoEngageEnabled: prefs.auto_engage_enabled,
      autoEngageEnabledAt: prefs.auto_engage_enabled_at,
      bonusMultiplier: parseFloat(prefs.bonus_multiplier),
      hasValidSigner: !!prefs.signer_uuid,
    });
  } catch (error: any) {
    console.error("[Engage Preferences] GET Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

/**
 * Update user engagement preferences
 * POST /api/portal/engage/preferences
 * 
 * Body: {
 *   fid: number,
 *   signerUuid?: string,
 *   autoEngageEnabled?: boolean
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid, signerUuid, autoEngageEnabled } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    console.log(`[Engage Preferences] Update: fid=${fid}, autoEngage=${autoEngageEnabled}, hasSigner=${!!signerUuid}`);

    // Calculate bonus multiplier (10% bonus for auto-engage users)
    const bonusMultiplier = autoEngageEnabled ? 1.1 : 1.0;

    // Upsert preferences
    const updateData: any = {
      fid,
      updated_at: new Date().toISOString(),
      bonus_multiplier: bonusMultiplier,
    };

    if (signerUuid !== undefined) {
      updateData.signer_uuid = signerUuid;
    }

    if (autoEngageEnabled !== undefined) {
      updateData.auto_engage_enabled = autoEngageEnabled;
      if (autoEngageEnabled) {
        updateData.auto_engage_enabled_at = new Date().toISOString();
      }
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences`,
      {
        method: "POST",
        headers: {
          ...SUPABASE_HEADERS,
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Engage Preferences] Supabase error:", errorText);
      throw new Error("Failed to update preferences");
    }

    const data = await res.json() as any[];
    const prefs = data[0];

    console.log(`[Engage Preferences] Updated successfully for FID ${fid}`);

    return NextResponse.json({
      success: true,
      fid: prefs.fid,
      signerUuid: prefs.signer_uuid,
      autoEngageEnabled: prefs.auto_engage_enabled,
      bonusMultiplier: parseFloat(prefs.bonus_multiplier),
      hasValidSigner: !!prefs.signer_uuid,
    });
  } catch (error: any) {
    console.error("[Engage Preferences] POST Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update preferences" },
      { status: 500 }
    );
  }
}
