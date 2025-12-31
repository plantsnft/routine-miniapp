import { NextResponse } from "next/server";
import { getNeynarUser } from "~/lib/neynar";
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

function collectWalletAddresses(fid: number, user: any): string[] {
  const addresses = new Set<string>();

  if (!user) {
    console.log(`[Engagement Claim] FID ${fid}: No Neynar profile found`);
    return [];
  }

  const maybeAdd = (value: string | null | undefined) => {
    const normalized = normalizeAddress(value);
    if (normalized) {
      addresses.add(normalized.toLowerCase());
    }
  };

  maybeAdd(user.custody_address);

  if (Array.isArray(user.verified_addresses?.eth_addresses)) {
    for (const verified of user.verified_addresses.eth_addresses) {
      maybeAdd(verified);
    }
  }

  if (Array.isArray((user as any)?.wallets)) {
    for (const wallet of (user as any).wallets) {
      maybeAdd(wallet?.address);
      if (Array.isArray(wallet?.addresses)) {
        for (const nested of wallet.addresses) {
          maybeAdd(nested);
        }
      }
    }
  }

  const unique = Array.from(addresses).map((addr) => ethers.getAddress(addr));
  if (unique.length === 0) {
    console.log(`[Engagement Claim] FID ${fid}: No wallet address found`);
  } else {
    console.log(`[Engagement Claim] FID ${fid}: Found addresses -> ${unique.join(", ")}`);
  }
  return unique;
}

/**
 * Claim engagement reward (after verification)
 * POST /api/portal/engagement/claim
 * Body: { fid: number, castHash: string, engagementType: 'like' | 'comment' | 'recast' }
 * 
 * This endpoint:
 * 1. Verifies the claim exists and is eligible
 * 2. Gets the user's wallet address from FID
 * 3. Sends ERC20 transfer transaction
 * 4. Stores transaction hash in database
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid, castHash, engagementType } = body;

    console.log(`[Engagement Claim] Request: fid=${fid}, castHash=${castHash}, type=${engagementType}`);

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
      const errorText = await checkRes.text();
      console.error("[Engagement Claim] Failed to check claim status:", errorText);
      throw new Error("Failed to check claim status");
    }

    const existing = await checkRes.json() as any;
    console.log(`[Engagement Claim] Existing claims found: ${existing?.length || 0}`);

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
          castHash: claim.cast_hash,
          engagementType: claim.engagement_type,
          rewardAmount: parseFloat(claim.reward_amount || "0"),
          transactionHash: claim.transaction_hash || undefined,
          claimedAt: claim.claimed_at,
        },
        { status: 400 }
      );
    }

    // Get user's wallet address from FID
    const user = await getNeynarUser(fid);
    if (!user) {
      return NextResponse.json(
        { error: "Could not fetch user data from Neynar" },
        { status: 500 }
      );
    }

    const walletAddresses = collectWalletAddresses(fid, user);
    if (walletAddresses.length === 0) {
      return NextResponse.json(
        { error: "No wallet address found for this user. Please connect a wallet." },
        { status: 400 }
      );
    }

    // Use the first available wallet address
    const recipientAddress = walletAddresses[0] as `0x${string}`;
    const rewardAmount = ENGAGEMENT_REWARDS[engagementType] || ENGAGEMENT_REWARDS.like;
    
    console.log(`[Engagement Claim] Sending ${rewardAmount.toString()} tokens to ${recipientAddress} for ${engagementType}`);

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
      args: [recipientAddress, rewardAmount],
    });

    // Log signer address for debugging
    console.log(`[Engagement Claim] Signer address: ${account.address}`);
    console.log(`[Engagement Claim] Token contract: ${TOKEN_ADDRESS}`);
    console.log(`[Engagement Claim] Recipient: ${recipientAddress}`);
    console.log(`[Engagement Claim] Amount: ${rewardAmount.toString()} (${Number(rewardAmount / (10n ** 18n))} CATWALK)`);

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

    // Update claim with claimed_at timestamp and transaction hash
    const updateData = {
      claimed_at: new Date().toISOString(),
      transaction_hash: transactionHash,
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
      // Transaction was sent but DB update failed - return success with warning
      return NextResponse.json({
        success: true,
        castHash: claim.cast_hash,
        engagementType: claim.engagement_type,
        rewardAmount: parseFloat(claim.reward_amount || "0"),
        transactionHash: transactionHash,
        claimedAt: new Date().toISOString(),
        warning: "Transaction sent but database update failed. Transaction hash saved.",
      });
    }

    const updated = await updateRes.json() as any;
    const updatedClaim = updated && updated.length > 0 ? updated[0] : { ...claim, ...updateData };

    console.log(`[Engagement Claim] ✅ SUCCESS! Sent ${Number(rewardAmount / (10n ** 18n))} CATWALK to ${recipientAddress}`);
    console.log(`[Engagement Claim] BaseScan: https://basescan.org/tx/${transactionHash}`);

    return NextResponse.json({
      success: true,
      castHash: updatedClaim.cast_hash,
      engagementType: updatedClaim.engagement_type,
      rewardAmount: parseFloat(updatedClaim.reward_amount || "0"),
      transactionHash: transactionHash,
      basescanUrl: `https://basescan.org/tx/${transactionHash}`,
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
