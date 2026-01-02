import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get("fid");
    if (!fid) {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );

    if (!res.ok) throw new Error("Failed to fetch preferences");

    const data = await res.json() as any[];
    if (data.length === 0) {
      return NextResponse.json({
        fid: parseInt(fid),
        signerUuid: null,
        signerApprovalUrl: null,
        autoEngageEnabled: false,
        bonusMultiplier: 1.0,
        hasValidSigner: false,
      });
    }

    const prefs = data[0];
    return NextResponse.json({
      fid: prefs.fid,
      signerUuid: prefs.signer_uuid,
      signerApprovalUrl: prefs.signer_approval_url || null,
      autoEngageEnabled: prefs.auto_engage_enabled,
      bonusMultiplier: parseFloat(prefs.bonus_multiplier),
      hasValidSigner: !!prefs.signer_uuid,
    });
  } catch (error: any) {
    console.error("[Engage Preferences] GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid, signerUuid, signerApprovalUrl, autoEngageEnabled } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json({ error: "fid required" }, { status: 400 });
    }

    console.log(`[Engage Preferences] Update: fid=${fid}, autoEngage=${autoEngageEnabled}, hasSigner=${!!signerUuid}, hasApprovalUrl=${!!signerApprovalUrl}`);

    const bonusMultiplier = autoEngageEnabled ? 1.1 : 1.0;

    // Check if exists first
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );
    const existing = await checkRes.json() as any[];
    const exists = existing && existing.length > 0;

    const updateData: any = {
      updated_at: new Date().toISOString(),
      bonus_multiplier: bonusMultiplier,
    };
    if (signerUuid !== undefined) updateData.signer_uuid = signerUuid;
    if (signerApprovalUrl !== undefined) updateData.signer_approval_url = signerApprovalUrl;
    if (autoEngageEnabled !== undefined) {
      updateData.auto_engage_enabled = autoEngageEnabled;
      if (autoEngageEnabled) updateData.auto_engage_enabled_at = new Date().toISOString();
    }

    let res;
    if (exists) {
      console.log(`[Engage Preferences] PATCH for FID ${fid}`);
      res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}`,
        {
          method: "PATCH",
          headers: { ...SUPABASE_HEADERS, Prefer: "return=representation" },
          body: JSON.stringify(updateData),
        }
      );
    } else {
      console.log(`[Engage Preferences] INSERT for FID ${fid}`);
      res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_engage_preferences`,
        {
          method: "POST",
          headers: { ...SUPABASE_HEADERS, Prefer: "return=representation" },
          body: JSON.stringify([{ fid, ...updateData }]),
        }
      );
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Engage Preferences] Supabase error:", errorText);
      throw new Error("Failed to update preferences");
    }

    const data = await res.json() as any[];
    const prefs = data[0];
    console.log(`[Engage Preferences] Updated for FID ${fid}`);

    return NextResponse.json({
      success: true,
      fid: prefs.fid,
      signerUuid: prefs.signer_uuid,
      signerApprovalUrl: prefs.signer_approval_url || null,
      autoEngageEnabled: prefs.auto_engage_enabled,
      bonusMultiplier: parseFloat(prefs.bonus_multiplier),
      hasValidSigner: !!prefs.signer_uuid,
    });
  } catch (error: any) {
    console.error("[Engage Preferences] POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}