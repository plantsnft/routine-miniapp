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
    console.log(`[Creator Claim-All] FID ${fid}: No Neynar profile found`);
    return [];
  }

  const maybeAdd = (value: string | null | undefined) => {
    const normalized = normalizeAddress(value);
    if (normalized) {
      addresses.add(normalized.toLowerCase());
    }
  };

  // Prioritize verified ETH addresses (Warpcast integrated wallet)
  if (Array.isArray(user.verified_addresses?.eth_addresses)) {
    for (const verified of user.verified_addresses.eth_addresses) {
      maybeAdd(verified);
    }
  }

  // Fallback to custody address
  maybeAdd(user.custody_address);

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
    console.log(`[Creator Claim-All] FID ${fid}: No wallet address found`);
  } else {
    console.log(`[Creator Claim-All] FID ${fid}: Found addresses -> ${unique.join(", ")}`);
  }
  return unique;
}

/**
 * Claim ALL unclaimed creator rewards in a single transaction
 * POST /api/portal/creator/claim-all
 * Body: { fid: number }
 * 
 * This endpoint:
 * 1. Gets all unclaimed creator_claims for the FID
 * 2. Sums total reward amount
 * 3. Gets the user's wallet address from FID
 * 4. Sends ONE ERC20 transfer transaction for total amount
 * 5. Updates ALL claims with same transaction hash
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

    console.log(`[Creator Claim-All] Processing batch claim for FID ${fid}...`);

    // Get ALL unclaimed creator_claims for this FID
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}&claimed_at=is.null`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    if (!checkRes.ok) {
      throw new Error("Failed to fetch unclaimed claims");
    }

    const unclaimedClaims = await checkRes.json() as any[];
    
    if (!unclaimedClaims || unclaimedClaims.length === 0) {
      return NextResponse.json(
        { error: "No unclaimed creator rewards found" },
        { status: 404 }
      );
    }

    console.log(`[Creator Claim-All] Found ${unclaimedClaims.length} unclaimed claims`);

    // Calculate total reward amount
    const totalRewardRaw = unclaimedClaims.reduce(
      (sum, claim) => sum + parseFloat(claim.reward_amount || "1000000"),
      0
    );
    const totalRewardBigInt = BigInt(Math.floor(totalRewardRaw)) * (10n ** TOKEN_DECIMALS);
    const castHashes = unclaimedClaims.map(c => c.cast_hash);

    console.log(`[Creator Claim-All] Total reward: ${totalRewardRaw.toLocaleString()} CATWALK for ${castHashes.length} casts`);

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

    // Use the first available wallet address (prefer verified ETH address)
    const recipientAddress = walletAddresses[0] as `0x${string}`;
    console.log(`[Creator Claim-All] Sending ${totalRewardRaw.toLocaleString()} CATWALK to ${recipientAddress}`);

    // Check if signer private key is configured
    if (!REWARD_SIGNER_PRIVATE_KEY) {
      console.error("[Creator Claim-All] REWARD_SIGNER_PRIVATE_KEY not configured");
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
      args: [recipientAddress, totalRewardBigInt],
    });

    // Send transaction
    let transactionHash: string;
    try {
      transactionHash = await walletClient.sendTransaction({
        to: TOKEN_ADDRESS as `0x${string}`,
        data: transferData,
      });
      console.log(`[Creator Claim-All] ✅ Transaction sent: ${transactionHash}`);
    } catch (txError: any) {
      console.error("[Creator Claim-All] ❌ Transaction failed:", txError);
      return NextResponse.json(
        { error: `Transaction failed: ${txError.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    // Wait for transaction receipt
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash as `0x${string}`,
      });
      console.log(`[Creator Claim-All] ✅ Transaction confirmed in block ${receipt.blockNumber}`);
    } catch (waitError) {
      console.error("[Creator Claim-All] ❌ Failed to confirm transaction receipt:", waitError);
      return NextResponse.json(
        { error: `Transaction sent but failed to confirm: ${transactionHash}` },
        { status: 500 }
      );
    }

    // Update ALL claims with claimed_at timestamp and transaction hash
    const claimedAt = new Date().toISOString();
    const updateData = {
      claimed_at: claimedAt,
      transaction_hash: transactionHash,
    };

    // Build filter for all cast hashes
    const castHashFilter = castHashes.map(h => `cast_hash.eq.${h}`).join(",");
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}&or=(${castHashFilter})`,
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
      console.error("[Creator Claim-All] Error updating claims:", errorText);
      // Transaction was sent but DB update failed - return success with warning
      return NextResponse.json({
        success: true,
        claimedCount: unclaimedClaims.length,
        totalAmount: totalRewardRaw,
        castHashes: castHashes,
        transactionHash: transactionHash,
        basescanUrl: `https://basescan.org/tx/${transactionHash}`,
        claimedAt: claimedAt,
        warning: "Transaction sent but database update failed. Transaction hash saved.",
      });
    }

    const basescanUrl = `https://basescan.org/tx/${transactionHash}`;
    console.log(`[Creator Claim-All] ✅ Successfully claimed ${unclaimedClaims.length} rewards. BaseScan: ${basescanUrl}`);

    return NextResponse.json({
      success: true,
      claimedCount: unclaimedClaims.length,
      totalAmount: totalRewardRaw,
      castHashes: castHashes,
      transactionHash: transactionHash,
      basescanUrl,
      claimedAt: claimedAt,
    });
  } catch (error: any) {
    console.error("[Creator Claim-All] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to claim rewards" },
      { status: 500 }
    );
  }
}
