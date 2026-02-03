import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

/**
 * Get claim status for a user (creator and engagement claims)
 * GET /api/portal/status?fid={fid}
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fidParam = searchParams.get("fid");

    if (!fidParam) {
      return NextResponse.json(
        { error: "fid parameter is required" },
        { status: 400 }
      );
    }

    const fid = parseInt(fidParam);
    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // Fetch ALL creator claims (supports multiple casts per creator)
    let creatorClaims: any[] = [];
    let creatorSummary = null;
    try {
      const creatorRes = await fetch(
        `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}&order=verified_at.desc`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (creatorRes.ok) {
        const creatorData = await creatorRes.json() as any;
        if (creatorData && creatorData.length > 0) {
          // Map all claims
          creatorClaims = creatorData.map((claim: any) => ({
            isEligible: true,
            hasClaimed: !!claim.claimed_at,
            castHash: claim.cast_hash,
            rewardAmount: parseFloat(claim.reward_amount || "1000000"),
            transactionHash: claim.transaction_hash || undefined,
            verifiedAt: claim.verified_at,
            claimedAt: claim.claimed_at || undefined,
          }));

          // Calculate summary
          const unclaimed = creatorClaims.filter((c: any) => !c.hasClaimed);
          const claimed = creatorClaims.filter((c: any) => c.hasClaimed);
          creatorSummary = {
            totalClaims: creatorClaims.length,
            unclaimedCount: unclaimed.length,
            claimedCount: claimed.length,
            unclaimedTotal: unclaimed.reduce((sum: number, c: any) => sum + c.rewardAmount, 0),
            claimedTotal: claimed.reduce((sum: number, c: any) => sum + c.rewardAmount, 0),
          };
        }
      }
    } catch (err) {
      console.error("[Portal Status] Error fetching creator claims:", err);
    }

    // Fetch engagement claim status
    let engagementData = null;
    try {
      const engagementRes = await fetch(
        `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (engagementRes.ok) {
        const engagementClaims = await engagementRes.json() as any;
        const claimed = engagementClaims.filter((c: any) => c.claimed_at);
        const unclaimed = engagementClaims.filter((c: any) => !c.claimed_at);

        engagementData = {
          eligibleCount: unclaimed.length,
          claimedCount: claimed.length,
          totalReward: engagementClaims.reduce(
            (sum: number, c: any) => sum + parseFloat(c.reward_amount || "0"),
            0
          ),
          claims: engagementClaims.map((c: any) => ({
            castHash: c.cast_hash,
            engagementType: c.engagement_type,
            rewardAmount: parseFloat(c.reward_amount || "0"),
            claimed: !!c.claimed_at,
          })),
        };
      }
    } catch (err) {
      console.error("[Portal Status] Error fetching engagement claims:", err);
    }

    return NextResponse.json({
      // Legacy single-claim format (first unclaimed or first claim for backward compat)
      creator: creatorClaims.find((c: any) => !c.hasClaimed) || creatorClaims[0] || null,
      // New multi-claim format
      creatorClaims: creatorClaims,
      creatorSummary: creatorSummary,
      engagement: engagementData,
    });
  } catch (error: any) {
    console.error("[Portal Status] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch claim status" },
      { status: 500 }
    );
  }
}
