import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { getNeynarUser } from "~/lib/neynar";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const REWARD_WALLET = "0x8efefE5D91f889A70d48742668e1d9266356c7B1";
const CATWALK_TOKEN = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
const REWARD_CLAIM_CONTRACT = process.env.REWARD_CLAIM_CONTRACT_ADDRESS || "";

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

// Query on-chain transfers from reward wallet to user for historical data
async function getOnChainWalkRewards(userAddress: string): Promise<{ amount: number; count: number }> {
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    // ERC20 Transfer event signature
    const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
    
    // Query transfer events from reward claim contract to user
    const logs = await client.getLogs({
      address: CATWALK_TOKEN as `0x${string}`,
      event: transferEvent,
      args: {
        from: REWARD_CLAIM_CONTRACT as `0x${string}`,
        to: userAddress as `0x${string}`,
      },
      fromBlock: BigInt(0),
      toBlock: 'latest',
    });

    let totalAmount = 0n;
    for (const log of logs) {
      if (log.args.value) {
        totalAmount += log.args.value;
      }
    }

    // Convert from 18 decimals to token amount
    const amountInTokens = Number(totalAmount / BigInt(10 ** 18));
    
    console.log(`[Lifetime Rewards] On-chain: Found ${logs.length} transfers totaling ${amountInTokens} tokens`);
    
    return { amount: amountInTokens, count: logs.length };
  } catch (err) {
    console.error("[Lifetime Rewards] On-chain query error:", err);
    return { amount: 0, count: 0 };
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

    // 3. Fetch VIRTUAL WALK rewards from checkins table
    // First try to get the total_walk_rewards from the checkins table
    const checkinRes = await fetch(
      `${SUPABASE_URL}/rest/v1/checkins?fid=eq.${fid}&select=total_checkins,total_walk_rewards`,
      { method: "GET", headers: SUPABASE_HEADERS }
    );

    if (checkinRes.ok) {
      const checkinData = await checkinRes.json() as any[];
      if (checkinData.length > 0) {
        const checkin = checkinData[0];
        const totalWalks = checkin.total_checkins || 0;
        let totalWalkRewards = checkin.total_walk_rewards || 0;
        
        console.log(`[Lifetime Rewards] FID ${fid}: DB shows ${totalWalks} walks, ${totalWalkRewards} total rewards`);
        
        // If total_walk_rewards is 0 but they have walks, try on-chain query as fallback
        if (totalWalkRewards === 0 && totalWalks > 0 && period === "lifetime") {
          console.log(`[Lifetime Rewards] FID ${fid}: No cached walk rewards, querying on-chain...`);
          try {
            // Get user's wallet address for on-chain lookup
            const user = await getNeynarUser(Number(fid));
            if (user) {
              const addresses = [
                ...(user.verified_addresses?.eth_addresses || []),
                user.custody_address,
              ].filter(Boolean) as string[];
              
              // Query on-chain for each address
              for (const address of addresses) {
                const onChainData = await getOnChainWalkRewards(address);
                if (onChainData.amount > totalWalkRewards) {
                  totalWalkRewards = onChainData.amount;
                  console.log(`[Lifetime Rewards] Using on-chain data: ${totalWalkRewards} tokens from ${address}`);
                  break;
                }
              }
              
              // Update the database with the on-chain value
              try {
                await fetch(
                  `${SUPABASE_URL}/rest/v1/checkins?fid=eq.${fid}`,
                  {
                    method: "PATCH",
                    headers: SUPABASE_HEADERS,
                    body: JSON.stringify({ total_walk_rewards: totalWalkRewards }),
                  }
                );
                console.log(`[Lifetime Rewards] Updated total_walk_rewards for FID ${fid}`);
              } catch (backfillErr) {
                console.error("[Lifetime Rewards] Backfill error:", backfillErr);
              }
            }
          } catch (onChainErr) {
            console.error("[Lifetime Rewards] On-chain fallback error:", onChainErr);
          }
        }
        
        breakdown.virtualWalk.amount = totalWalkRewards;
        breakdown.virtualWalk.count = totalWalks;
      }
    }

    // Calculate total
    breakdown.total = breakdown.creator.amount + breakdown.patron.amount + breakdown.virtualWalk.amount;

    console.log(`[Lifetime Rewards] FID ${fid} (${period}):`, {
      creator: breakdown.creator,
      patron: breakdown.patron.count,
      virtualWalk: breakdown.virtualWalk,
      total: breakdown.total,
    });

    // Also provide legacy format for backwards compatibility with existing UI
    const legacyBreakdown = {
      posting: breakdown.creator.amount,
      like: breakdown.patron.likes.amount,
      recast: breakdown.patron.recasts.amount,
      comment: breakdown.patron.comments.amount,
      total: breakdown.total,
    };
    
    const legacyCounts = {
      posting: breakdown.creator.count,
      like: breakdown.patron.likes.count,
      recast: breakdown.patron.recasts.count,
      comment: breakdown.patron.comments.count,
      total: breakdown.creator.count + breakdown.patron.count,
    };

    return NextResponse.json({
      fid: Number(fid),
      period,
      breakdown: legacyBreakdown,
      claimCounts: legacyCounts,
      // Also include new 3-section format for future UI updates
      sections: breakdown,
    });
  } catch (error: any) {
    console.error("[Lifetime Rewards] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch lifetime rewards" },
      { status: 500 }
    );
  }
}
