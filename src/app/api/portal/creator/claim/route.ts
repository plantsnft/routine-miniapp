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
const CREATOR_REWARD_AMOUNT = 500_000n * (10n ** TOKEN_DECIMALS); // 500,000 CATWALK tokens

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
    console.log(`[Creator Claim] FID ${fid}: No Neynar profile found`);
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
    console.log(`[Creator Claim] FID ${fid}: No wallet address found`);
  } else {
    console.log(`[Creator Claim] FID ${fid}: Found addresses -> ${unique.join(", ")}`);
  }
  return unique;
}

/**
 * Claim creator reward (after verification)
 * POST /api/portal/creator/claim
 * Body: { fid: number }
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
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    // Check if claim exists and is verified but not yet claimed
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}&limit=1`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    if (!checkRes.ok) {
      throw new Error("Failed to check claim status");
    }

    const existing = await checkRes.json() as any;
    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { error: "No verified claim found. Please verify first." },
        { status: 404 }
      );
    }

    const claim = existing[0];
    if (claim.claimed_at) {
      return NextResponse.json(
        {
          error: "Reward already claimed",
          isEligible: true,
          hasClaimed: true,
          castHash: claim.cast_hash,
          rewardAmount: parseFloat(claim.reward_amount || "500000"),
          transactionHash: claim.transaction_hash || undefined,
          verifiedAt: claim.verified_at,
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

    // Use the first available wallet address (prefer custody address)
    const recipientAddress = walletAddresses[0] as `0x${string}`;
    console.log(`[Creator Claim] Sending ${CREATOR_REWARD_AMOUNT.toString()} tokens to ${recipientAddress}`);

    // Check if signer private key is configured
    if (!REWARD_SIGNER_PRIVATE_KEY) {
      console.error("[Creator Claim] REWARD_SIGNER_PRIVATE_KEY not configured");
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
      args: [recipientAddress, CREATOR_REWARD_AMOUNT],
    });

    // Send transaction
    let transactionHash: string;
    try {
      transactionHash = await walletClient.sendTransaction({
        to: TOKEN_ADDRESS as `0x${string}`,
        data: transferData,
      });
      console.log(`[Creator Claim] Transaction sent: ${transactionHash}`);
    } catch (txError: any) {
      console.error("[Creator Claim] Transaction failed:", txError);
      return NextResponse.json(
        { error: `Transaction failed: ${txError.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    // Wait for transaction receipt (optional, but good for confirmation)
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash as `0x${string}`,
      });
      console.log(`[Creator Claim] Transaction confirmed in block ${receipt.blockNumber}`);
    } catch (waitError) {
      console.warn("[Creator Claim] Could not wait for receipt (non-critical):", waitError);
      // Continue anyway - transaction was sent
    }

    // Update claim with claimed_at timestamp and transaction hash
    const updateData = {
      claimed_at: new Date().toISOString(),
      transaction_hash: transactionHash,
    };

    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}`,
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
      console.error("[Creator Claim] Error updating claim:", errorText);
      // Transaction was sent but DB update failed - return success with warning
      return NextResponse.json({
        isEligible: true,
        hasClaimed: true,
        castHash: claim.cast_hash,
        rewardAmount: parseFloat(claim.reward_amount || "500000"),
        transactionHash: transactionHash,
        verifiedAt: claim.verified_at,
        claimedAt: new Date().toISOString(),
        warning: "Transaction sent but database update failed. Transaction hash saved.",
      });
    }

    const updated = await updateRes.json() as any;
    const updatedClaim = updated && updated.length > 0 ? updated[0] : { ...claim, ...updateData };

    return NextResponse.json({
      isEligible: true,
      hasClaimed: true,
      castHash: updatedClaim.cast_hash,
      rewardAmount: parseFloat(updatedClaim.reward_amount || "500000"),
      transactionHash: transactionHash,
      verifiedAt: updatedClaim.verified_at,
      claimedAt: updatedClaim.claimed_at,
    });
  } catch (error: any) {
    console.error("[Creator Claim] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to claim reward" },
      { status: 500 }
    );
  }
}
