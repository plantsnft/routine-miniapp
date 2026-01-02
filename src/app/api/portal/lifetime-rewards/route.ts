import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// Reward amounts (must match claim routes)
const ENGAGEMENT_REWARDS: Record<string, number> = {
  like: 1_000,
  recast: 2_000,
  comment: 5_000,
};

const CREATOR_REWARD = 1_000_000; // 1M per cast

// Virtual walk reward tiers (average - actual varies by score)
const WALK_REWARD_AVG = 100_000; // Average walk reward

interface RewardBreakdown {
  creator: { amount: number; count: number };
  patron: { 
    amount: number; 
    count: number;
    likes: { amount: number; count: number };
    recasts: { amount: number; count: number };
    comments: { amount: number; count: number };
  };
  virtualWalk: { amount: number; count: number };
  total: number;
}

function getDateFilter(period: string): string | null {
  const now = new Date();
  
  switch (period) {
    case "7d":
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    case "30d":
      now.setDate(now.getDate() - 30);
      return now.toISOString();
    case "1y":
      now.setFullYear(now.getFullYear() - 1);
      return now.toISOString();
    case "lifetime":
    default:
      return null; // No filter = all time
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get("fid");
    const period = searchParams.get("period") || "lifetime";

    if (!fid) {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    console.log(`[Lifetime Rewards] Fetching for FID ${fid}, period: ${period}`);

    const dateFilter = getDateFilter(period);

    // Initialize breakdown
    const breakdown: RewardBreakdown = {
      creator: { amount: 0, count: 0 },
      patron: { 
        amount: 0, 
        count: 0,
        likes: { amount: 0, count: 0 },
        recasts: { amount: 0, count: 0 },
        comments: { amount: 0, count: 0 },
      },
      virtualWalk: { amount: 0, count: 0 },
      total: 0,
    };

    // 1. Fetch CREATOR claims (posting rewards)
    const creatorDateQuery = dateFilter ? `&claimed_at=gte.${dateFilter}` : "";
    const creatorRes = await fetch(
      `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}&claimed_at=not.is.null${creatorDateQuery}&select=claimed_at,reward_amount`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );

    if (creatorRes.ok) {
      const creatorClaims = await creatorRes.json() as any[];
      breakdown.creator.count = creatorClaims.length;
      for (const claim of creatorClaims) {
        const reward = claim.reward_amount ? Number(claim.reward_amount) : CREATOR_REWARD;
        breakdown.creator.amount += reward;
      }
    }

    // 2. Fetch PATRON claims (engagement rewards: like, recast, comment)
    const engagementDateQuery = dateFilter ? `&claimed_at=gte.${dateFilter}` : "";
    const engagementRes = await fetch(
      `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&claimed_at=not.is.null${engagementDateQuery}&select=engagement_type,claimed_at`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );

    if (engagementRes.ok) {
      const engagementClaims = await engagementRes.json() as any[];
      
      for (const claim of engagementClaims) {
        const type = claim.engagement_type as string;
        const reward = ENGAGEMENT_REWARDS[type] || 0;
        
        breakdown.patron.amount += reward;
        breakdown.patron.count += 1;
        
        if (type === "like") {
          breakdown.patron.likes.amount += reward;
          breakdown.patron.likes.count += 1;
        } else if (type === "recast") {
          breakdown.patron.recasts.amount += reward;
          breakdown.patron.recasts.count += 1;
        } else if (type === "comment") {
          breakdown.patron.comments.amount += reward;
          breakdown.patron.comments.count += 1;
        }
      }
    }

    // 3. Fetch VIRTUAL WALK claims (daily check-in rewards)
    // The checkins table has reward_claimed_at when user claimed
    const walkDateQuery = dateFilter ? `&reward_claimed_at=gte.${dateFilter}` : "";
    const walkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkins?fid=eq.${fid}&reward_claimed_at=not.is.null${walkDateQuery}&select=reward_claimed_at,total_checkins`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );

    if (walkRes.ok) {
      const walkClaims = await walkRes.json() as any[];
      // Each claimed day counts as one virtual walk reward
      // Note: The actual reward varies by score, using average for display
      breakdown.virtualWalk.count = walkClaims.length;
      breakdown.virtualWalk.amount = walkClaims.length * WALK_REWARD_AVG;
    }

    // Calculate total
    breakdown.total = breakdown.creator.amount + breakdown.patron.amount + breakdown.virtualWalk.amount;

    console.log(`[Lifetime Rewards] FID ${fid} (${period}):`, {
      creator: breakdown.creator,
      patron: breakdown.patron.count,
      virtualWalk: breakdown.virtualWalk,
      total: breakdown.total,
    });

    return NextResponse.json({
      fid: Number(fid),
      period,
      breakdown,
    });
  } catch (error: any) {
    console.error("[Lifetime Rewards] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch lifetime rewards" },
      { status: 500 }
    );
  }
}

