import { NextResponse } from "next/server";
import { getNeynarUser } from "~/lib/neynar";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";
import { createWalletClient, createPublicClient, http, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { ethers } from "ethers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"; // CATWALK token on Base
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const REWARD_SIGNER_PRIVATE_KEY = process.env.REWARD_SIGNER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
const TOKEN_DECIMALS = 18n;

// Reward amounts per engagement type (in tokens, will be multiplied by decimals)
const ENGAGEMENT_REWARDS: Record<string, bigint> = {
  like: 1_000n * (10n ** TOKEN_DECIMALS),      // 1,000 CATWALK
  recast: 2_000n * (10n ** TOKEN_DECIMALS),    // 2,000 CATWALK
  comment: 5_000n * (10n ** TOKEN_DECIMALS),   // 5,000 CATWALK
};

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// ERC20 Transfer ABI
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function normalizeAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    return ethers.getAddress(address);
  } catch {
    return null;
  }
}

function getWarpcastWalletAddress(fid: number, user: any): string | null {
  // Priority order:
  // 1. Verified ETH addresses (Warpcast integrated wallet on Base)
  // 2. Custody address (fallback)

  if (!user) {
    console.log(`[Engagement Claim] FID ${fid}: No Neynar profile found`);
    return null;
  }

  // First priority: Verified ETH addresses (Warpcast wallet)
  if (Array.isArray(user.verified_addresses?.eth_addresses)) {
    for (const verified of user.verified_addresses.eth_addresses) {
      const normalized = normalizeAddress(verified);
      if (normalized) {
        console.log(`[Engagement Claim] FID ${fid}: Using verified Warpcast wallet: ${normalized}`);
        return normalized;
      }
    }
  }

  // Second priority: Custody address
  const custodyNormalized = normalizeAddress(user.custody_address);
  if (custodyNormalized) {
    console.log(`[Engagement Claim] FID ${fid}: Using custody address: ${custodyNormalized}`);
    return custodyNormalized;
  }

  // Check wallets array as last resort
  if (Array.isArray((user as any)?.wallets)) {
    for (const wallet of (user as any).wallets) {
      const walletAddr = normalizeAddress(wallet?.address);
      if (walletAddr) {
        console.log(`[Engagement Claim] FID ${fid}: Using wallet from wallets array: ${walletAddr}`);
        return walletAddr;
      }
    }
  }

  console.log(`[Engagement Claim] FID ${fid}: No wallet address found`);
  return null;
}

/**
 * Claim engagement reward (after verification)
 * POST /api/portal/engagement/claim
 * Body: { fid: number, castHash: string, engagementTypes: ['like', 'comment', 'recast'] }
 *       OR { fid: number, castHash: string, engagementType: 'like' } (backwards compatible)
 * 
 * This endpoint:
 * 1. Verifies the claim(s) exist and are eligible
 * 2. Gets the user's wallet address from FID
 * 3. Sends ONE ERC20 transfer transaction for the total amount
 * 4. Stores transaction hash in database for all claims
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid, castHash, engagementType, engagementTypes: rawEngagementTypes } = body;

    // Support both single engagementType and array of engagementTypes
    let engagementTypes: string[] = [];
    if (rawEngagementTypes && Array.isArray(rawEngagementTypes)) {
      engagementTypes = rawEngagementTypes.filter((t: string) => ["like", "comment", "recast"].includes(t));
    } else if (engagementType && ["like", "comment", "recast"].includes(engagementType)) {
      engagementTypes = [engagementType];
    }

    console.log(`[Engagement Claim] Request: fid=${fid}, castHash=${castHash}, types=${engagementTypes.join(',')}`);

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

    if (engagementTypes.length === 0) {
      return NextResponse.json(
        { error: "engagementType or engagementTypes array is required" },
        { status: 400 }
      );
    }

    // Check ALL claims for this cast that are verified but not yet claimed
    const typeFilter = engagementTypes.map(t => `engagement_type.eq.${t}`).join(',');
    const queryUrl = `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&cast_hash=eq.${castHash}&or=(${typeFilter})&claimed_at=is.null`;
    console.log(`[Engagement Claim] Query URL: ${queryUrl}`);
    console.log(`[Engagement Claim] Query params: fid=${fid}, castHash=${castHash}, types=${engagementTypes.join(',')}`);
    
    const checkRes = await fetch(queryUrl, {
      method: "GET",
      headers: SUPABASE_HEADERS,
    });
    
    if (!checkRes.ok) {
      const errorText = await checkRes.text();
      console.error(`[Engagement Claim] Query failed: ${checkRes.status} ${checkRes.statusText}`, errorText);
      throw new Error("Failed to check claim status");
    }

    const unclaimedClaims = await checkRes.json() as any[];
    console.log(`[Engagement Claim] Unclaimed claims found: ${unclaimedClaims?.length || 0}`);
    if (unclaimedClaims && unclaimedClaims.length > 0) {
      console.log(`[Engagement Claim] Found claims:`, unclaimedClaims.map(c => ({ id: c.id, type: c.engagement_type, verified_at: c.verified_at, claimed_at: c.claimed_at })));
    } else {
      // Debug: Check if ANY claims exist for this cast (even claimed ones)
      const allClaimsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&cast_hash=eq.${castHash}`,
        { method: "GET", headers: SUPABASE_HEADERS }
      );
      if (allClaimsRes.ok) {
        const allClaims = await allClaimsRes.json() as any[];
        console.log(`[Engagement Claim] Total claims for this cast (including claimed): ${allClaims.length}`, 
          allClaims.map(c => ({ type: c.engagement_type, verified_at: c.verified_at, claimed_at: c.claimed_at })));
      }
    }

    if (!unclaimedClaims || unclaimedClaims.length === 0) {
      return NextResponse.json(
        { error: "No verified unclaimed engagements found for this cast." },
        { status: 404 }
      );
    }

    // Calculate total reward amount
    let totalRewardAmount = 0n;
    const claimedTypes: string[] = [];
    for (const claim of unclaimedClaims) {
      const rewardForType = ENGAGEMENT_REWARDS[claim.engagement_type] || 0n;
      totalRewardAmount += rewardForType;
      claimedTypes.push(claim.engagement_type);
    }

    // Check for auto-engage bonus multiplier
    let bonusMultiplier = 1.0;
    try {
      const prefsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_engage_preferences?fid=eq.${fid}&limit=1`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );
      if (prefsRes.ok) {
        const prefs = await prefsRes.json() as any[];
        if (prefs.length > 0 && prefs[0].auto_engage_enabled) {
          bonusMultiplier = parseFloat(prefs[0].bonus_multiplier) || 1.1;
          console.log(`[Engagement Claim] Auto-engage bonus: ${bonusMultiplier}x`);
        }
      }
    } catch (err) {
      console.log("[Engagement Claim] Could not check bonus multiplier:", err);
    }

    // Apply bonus if eligible
    if (bonusMultiplier > 1) {
      const bonusAmount = (totalRewardAmount * BigInt(Math.round((bonusMultiplier - 1) * 100))) / 100n;
      totalRewardAmount += bonusAmount;
      console.log(`[Engagement Claim] Applied ${((bonusMultiplier - 1) * 100).toFixed(0)}% bonus: +${Number(bonusAmount / (10n ** 18n))} CATWALK`);
    }

    console.log(`[Engagement Claim] Claiming ${claimedTypes.length} actions: ${claimedTypes.join(', ')}`);
    console.log(`[Engagement Claim] Total reward: ${Number(totalRewardAmount / (10n ** 18n))} CATWALK (${bonusMultiplier > 1 ? `includes ${((bonusMultiplier - 1) * 100).toFixed(0)}% bonus` : 'no bonus'})`);

    // Get user's wallet address from FID
    const user = await getNeynarUser(fid);
    if (!user) {
      return NextResponse.json(
        { error: "Could not fetch user data from Neynar" },
        { status: 500 }
      );
    }

    // Get Warpcast integrated wallet address (prioritizes verified ETH addresses)
    const walletAddress = getWarpcastWalletAddress(fid, user);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet address found for this user. Please connect a wallet in Warpcast." },
        { status: 400 }
      );
    }

    // Use the Warpcast wallet address
    const recipientAddress = walletAddress as `0x${string}`;
    
    console.log(`[Engagement Claim] Sending ${totalRewardAmount.toString()} tokens to ${recipientAddress} for ${claimedTypes.join(', ')}`);

    // Check if signer private key is configured
    if (!REWARD_SIGNER_PRIVATE_KEY) {
      console.error("[Engagement Claim] REWARD_SIGNER_PRIVATE_KEY not configured");
      return NextResponse.json(
        { error: "Reward signer not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Create wallet client for sending transaction
    const account = privateKeyToAccount(REWARD_SIGNER_PRIVATE_KEY as `0x${string}`);
    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    // Encode transfer function call
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipientAddress, totalRewardAmount],
    });

    // Log signer address for debugging
    console.log(`[Engagement Claim] Signer address: ${account.address}`);
    console.log(`[Engagement Claim] Token contract: ${TOKEN_ADDRESS}`);
    console.log(`[Engagement Claim] Recipient: ${recipientAddress}`);
    console.log(`[Engagement Claim] Amount: ${totalRewardAmount.toString()} (${Number(totalRewardAmount / (10n ** 18n))} CATWALK)`);

    // Send transaction
    let transactionHash: string;
    try {
      transactionHash = await walletClient.sendTransaction({
        to: TOKEN_ADDRESS as `0x${string}`,
        data: transferData,
      });
      console.log(`[Engagement Claim] ✅ Transaction sent: ${transactionHash}`);
    } catch (txError: any) {
      console.error("[Engagement Claim] ❌ Transaction FAILED:", txError.message || txError);
      console.error("[Engagement Claim] Full error:", JSON.stringify(txError, null, 2));
      return NextResponse.json(
        { error: `Transaction failed: ${txError.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    // Wait for transaction receipt - REQUIRED to confirm success
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash as `0x${string}`,
        timeout: 60_000, // 60 second timeout
      });
      console.log(`[Engagement Claim] ✅ Transaction confirmed in block ${receipt.blockNumber}`);
      console.log(`[Engagement Claim] Transaction status: ${receipt.status}`);
      
      if (receipt.status === 'reverted') {
        console.error(`[Engagement Claim] ❌ Transaction REVERTED!`);
        return NextResponse.json(
          { error: "Transaction was reverted. The signer wallet may not have enough CATWALK tokens." },
          { status: 500 }
        );
      }
    } catch (waitError: any) {
      console.error("[Engagement Claim] ❌ Failed to confirm transaction:", waitError.message || waitError);
      // Don't update database if we can't confirm the transaction
      return NextResponse.json(
        { 
          error: "Transaction sent but could not be confirmed. Please check BaseScan manually.",
          transactionHash: transactionHash,
          basescanUrl: `https://basescan.org/tx/${transactionHash}`,
        },
        { status: 500 }
      );
    }

    // Update ALL claims with claimed_at timestamp and transaction hash
    const updateData = {
      claimed_at: new Date().toISOString(),
      transaction_hash: transactionHash,
    };

    // Update each claim in the database
    let updateErrors = 0;
    for (const claim of unclaimedClaims) {
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
        console.error(`[Engagement Claim] Error updating claim ${claim.id}:`, errorText);
        updateErrors++;
      }
    }

    if (updateErrors > 0) {
      console.warn(`[Engagement Claim] ${updateErrors} claims failed to update in database`);
    }

    const totalRewardTokens = Number(totalRewardAmount / (10n ** 18n));
    console.log(`[Engagement Claim] ✅ SUCCESS! Sent ${totalRewardTokens} CATWALK to ${recipientAddress}`);
    console.log(`[Engagement Claim] BaseScan: https://basescan.org/tx/${transactionHash}`);

    // ===== PHASE 2.1: INVALIDATE CACHE ON CLAIM =====
    // Delete engagement_cache entry so next verification shows updated claimable rewards
    try {
      const supabase = getSupabaseAdmin();
      const { error: deleteError } = await supabase
        .from("engagement_cache")
        .delete()
        .eq("fid", fid)
        .eq("channel_id", "catwalk");

      if (deleteError) {
        console.warn("[Engagement Claim] Failed to invalidate cache (non-fatal):", deleteError.message);
      } else {
        console.log(`[Engagement Claim] ✅ Invalidated engagement cache for FID ${fid}`);
      }
    } catch (cacheErr) {
      // Non-fatal: if cache invalidation fails, still return success
      console.warn("[Engagement Claim] Cache invalidation error (non-fatal):", cacheErr);
    }
    // ===== END CACHE INVALIDATION =====

    return NextResponse.json({
      success: true,
      castHash: castHash,
      engagementTypes: claimedTypes,
      claimedCount: claimedTypes.length,
      rewardAmount: totalRewardTokens,
      bonusApplied: bonusMultiplier > 1,
      bonusMultiplier: bonusMultiplier,
      transactionHash: transactionHash,
      basescanUrl: `https://basescan.org/tx/${transactionHash}`,
      claimedAt: updateData.claimed_at,
    });
  } catch (error: any) {
    console.error("[Engagement Claim] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to claim reward" },
      { status: 500 }
    );
  }
}
