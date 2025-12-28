import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

/**
 * Claim engagement reward (after verification)
 * POST /api/portal/engagement/claim
 * Body: { fid: number, castHash: string, engagementType: 'like' | 'comment' | 'recast' }
 * 
 * Note: This endpoint marks the engagement claim as claimed. The actual token transfer
 * should be handled by a smart contract or external service. For now, we'll
 * just update the database record with claimed_at timestamp.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid, castHash, engagementType } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    if (!castHash || typeof castHash !== "string") {
      return NextResponse.json(
        { error: "castHash is required and must be a string" },
        { status: 400 }
      );
    }

    if (!engagementType || !["like", "comment", "recast"].includes(engagementType)) {
      return NextResponse.json(
        { error: "engagementType must be 'like', 'comment', or 'recast'" },
        { status: 400 }
      );
    }

    // Check if claim exists and is verified but not yet claimed
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&cast_hash=eq.${castHash}&engagement_type=eq.${engagementType}&limit=1`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    if (!checkRes.ok) {
      throw new Error("Failed to check claim status");
    }

    const existing = await checkRes.json();
    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { error: "No verified engagement claim found. Please verify first." },
        { status: 404 }
      );
    }

    const claim = existing[0];
    if (claim.claimed_at) {
      return NextResponse.json(
        {
          error: "Reward already claimed for this engagement",
        },
        { status: 400 }
      );
    }

    // Update claim with claimed_at timestamp
    // TODO: In production, this should trigger a smart contract call to transfer tokens
    // For now, we'll just mark it as claimed
    const updateData = {
      claimed_at: new Date().toISOString(),
      // transaction_hash will be set when smart contract is integrated
    };

    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/engagement_claims?id=eq.${claim.id}`,
      {
        method: "PATCH",
        headers: {
          ...SUPABASE_HEADERS,
          Prefer: "return=representation",
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error("[Engagement Claim] Error updating claim:", errorText);
      throw new Error("Failed to claim reward");
    }

    const updated = await updateRes.json();
    const updatedClaim = updated && updated.length > 0 ? updated[0] : { ...claim, ...updateData };

    return NextResponse.json({
      success: true,
      castHash: updatedClaim.cast_hash,
      engagementType: updatedClaim.engagement_type,
      rewardAmount: parseFloat(updatedClaim.reward_amount || "0"),
      transactionHash: updatedClaim.transaction_hash || undefined,
      claimedAt: updatedClaim.claimed_at,
    });
  } catch (error: any) {
    console.error("[Engagement Claim] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to claim reward" },
      { status: 500 }
    );
  }
}
