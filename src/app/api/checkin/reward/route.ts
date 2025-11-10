import { NextRequest, NextResponse } from "next/server";
import { getCheckinByFid, updateCheckin } from "~/lib/supabase";
import { getCheckInDayId } from "~/lib/dateUtils";
import { getNeynarClient } from "~/lib/neynar";

// CATWALK token contract address on Base (kept for reference, not used in this route)
// const CATWALK_TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
// Reward claim contract address (deploy and set this)
const REWARD_CLAIM_CONTRACT_ADDRESS = process.env.REWARD_CLAIM_CONTRACT_ADDRESS || "";
const REWARD_AMOUNT_USD = 0.03; // 3 cents
// SERVER_WALLET_ADDRESS is now set in the smart contract during deployment
// It's not needed in the API route since users sign their own transactions
// const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

/**
 * Validate Ethereum address format
 */
function isValidAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  // Ethereum address: 0x followed by 40 hex characters
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Get user's wallet address from Neynar API.
 * 
 * Priority order:
 * 1. Custodial address (every Farcaster user has this - best for UX)
 * 2. Verified addresses (user's external wallets - fallback)
 * 
 * Returns null if user has no wallet address (will be skipped from reward flow).
 */
async function getUserWalletAddress(fid: number): Promise<string | null> {
  try {
    const client = getNeynarClient();
    const { users } = await client.fetchBulkUsers({ fids: [fid] });
    const user = users[0];
    
    if (!user) {
      console.log(`[Reward Claim] No user found for FID ${fid}`);
      return null;
    }
    
    // Priority 1: Custodial address (every Farcaster user has this)
    // This is Farcaster's integrated wallet - works for 100% of users
    if (user.custody_address) {
      console.log(`[Reward Claim] FID ${fid}: Using custodial address ${user.custody_address}`);
      return user.custody_address;
    }
    
    // Priority 2: Verified addresses (user's external wallets - MetaMask, etc.)
    // Fallback if custodial address is not available
    if (user.verified_addresses?.ethAddresses && user.verified_addresses.ethAddresses.length > 0) {
      const verifiedAddr = user.verified_addresses.ethAddresses[0];
      console.log(`[Reward Claim] FID ${fid}: Using verified address ${verifiedAddr}`);
      return verifiedAddr;
    }
    
    // Additional fallback: Try eth_addresses field (some API versions use this)
    if (user.eth_addresses && Array.isArray(user.eth_addresses) && user.eth_addresses.length > 0) {
      const ethAddr = user.eth_addresses[0];
      console.log(`[Reward Claim] FID ${fid}: Using eth_addresses field ${ethAddr}`);
      return ethAddr;
    }
    
    // No wallet address found - user will be skipped from reward flow
    console.log(`[Reward Claim] FID ${fid}: No wallet address found (no custodial or verified address)`);
    return null;
  } catch (error: any) {
    console.error(`[Reward Claim] Error fetching wallet address for FID ${fid}:`, error.message);
    return null;
  }
}

/**
 * Get current CATWALK token price in USD.
 */
async function getTokenPrice(): Promise<number | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_URL || 'https://catwalk-smoky.vercel.app'}/api/token-price`);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.price || null;
  } catch (error: any) {
    console.error("[Reward Claim] Error fetching token price:", error.message);
    return null;
  }
}

/**
 * Calculate token amount for 3 cents USD.
 */
function calculateTokenAmount(priceUsd: number): bigint {
  // Calculate: 0.03 USD / price per token = token amount
  // CATWALK has 18 decimals
  const tokenAmount = (REWARD_AMOUNT_USD / priceUsd) * Math.pow(10, 18);
  return BigInt(Math.floor(tokenAmount));
}

/**
 * Calculate day ID from timestamp (timestamp / 86400)
 * Used to prevent double claims per day.
 */
function getDayId(timestamp: Date): bigint {
  const timestampSeconds = Math.floor(timestamp.getTime() / 1000);
  return BigInt(Math.floor(timestampSeconds / 86400));
}

/**
 * Prepare transaction data for user to sign and send.
 * Returns transaction parameters that the client can use with Wagmi.
 */
async function prepareClaimTransaction(
  fid: number,
  userAddress: string,
  tokenAmount: bigint
): Promise<{
  to: string;
  data: string;
  value: bigint;
} | null> {
  // Validate contract address is set and valid
  if (!REWARD_CLAIM_CONTRACT_ADDRESS) {
    console.error("[Reward Claim] REWARD_CLAIM_CONTRACT_ADDRESS not configured in environment variables");
    throw new Error("Reward contract address not configured. Please set REWARD_CLAIM_CONTRACT_ADDRESS in Vercel environment variables.");
  }
  
  if (!isValidAddress(REWARD_CLAIM_CONTRACT_ADDRESS)) {
    console.error("[Reward Claim] Invalid contract address format:", REWARD_CLAIM_CONTRACT_ADDRESS);
    throw new Error(`Invalid contract address format. Expected 0x followed by 40 hex characters, got: ${REWARD_CLAIM_CONTRACT_ADDRESS.substring(0, 20)}...`);
  }
  
  try {
    // Dynamically import viem to avoid bundling issues
    const { encodeFunctionData } = await import("viem");
    
    // RewardClaim contract ABI - claim function
    const rewardClaimAbi = [
      {
        name: "claim",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "fid", type: "uint256" },
          { name: "dayId", type: "uint256" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
      },
    ] as const;
    
    // Calculate dayId (current day)
    const dayId = getDayId(new Date());
    
    // Encode function call
    const data = encodeFunctionData({
      abi: rewardClaimAbi,
      functionName: "claim",
      args: [BigInt(fid), dayId, tokenAmount],
    });
    
    // Ensure address is lowercase for consistency
    const contractAddress = REWARD_CLAIM_CONTRACT_ADDRESS.toLowerCase() as `0x${string}`;
    
    return {
      to: contractAddress,
      data: data as `0x${string}`,
      value: 0n, // No ETH value, just contract call
    };
  } catch (error: any) {
    console.error("[Reward Claim] Error preparing transaction:", error.message);
    // Re-throw with more context
    if (error.message.includes("not configured") || error.message.includes("Invalid contract address")) {
      throw error;
    }
    throw new Error(`Failed to prepare transaction: ${error.message}`);
  }
}

// Removed transferTokens function - users now sign and send transactions themselves

/**
 * POST endpoint to claim daily reward.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fid = Number(body.fid);
    
    if (!fid || isNaN(fid)) {
      return NextResponse.json(
        { ok: false, error: "Invalid fid" },
        { status: 400 }
      );
    }
    
    // Get user's check-in record
    const checkin = await getCheckinByFid(fid);
    if (!checkin) {
      return NextResponse.json(
        { ok: false, error: "No check-in record found. Please check in first." },
        { status: 400 }
      );
    }
    
    // Check if user has checked in today
    if (!checkin.last_checkin) {
      return NextResponse.json(
        { ok: false, error: "You must check in before claiming your reward." },
        { status: 400 }
      );
    }
    
    const lastCheckinDate = new Date(checkin.last_checkin);
    const today = new Date();
    const hasCheckedInToday = getCheckInDayId(lastCheckinDate) === getCheckInDayId(today);
    
    if (!hasCheckedInToday) {
      return NextResponse.json(
        { ok: false, error: "You must check in today before claiming your reward." },
        { status: 400 }
      );
    }
    
    // Check if reward already claimed today
    if (checkin.reward_claimed_at) {
      const claimedDate = new Date(checkin.reward_claimed_at);
      const claimedToday = getCheckInDayId(claimedDate) === getCheckInDayId(today);
      
      if (claimedToday) {
        return NextResponse.json(
          { ok: false, error: "Reward already claimed today." },
          { status: 409 }
        );
      }
    }
    
    // Get user's wallet address (prioritizes custodial, falls back to verified)
    const walletAddress = await getUserWalletAddress(fid);
    if (!walletAddress) {
      // Skip users without wallet addresses (as per requirements)
      // Only logged-in Farcaster users with wallets can claim
      return NextResponse.json(
        { ok: false, error: "No wallet address found. Please ensure you are logged in to Farcaster." },
        { status: 400 }
      );
    }
    
    // Get current token price
    const tokenPrice = await getTokenPrice();
    if (!tokenPrice || tokenPrice <= 0) {
      return NextResponse.json(
        { ok: false, error: "Could not fetch token price. Please try again later." },
        { status: 500 }
      );
    }
    
    // Calculate token amount
    const tokenAmount = calculateTokenAmount(tokenPrice);
    console.log(`[Reward Claim] FID ${fid}: Preparing claim for ${tokenAmount.toString()} tokens (${REWARD_AMOUNT_USD} USD at $${tokenPrice})`);
    
    // Validate contract address before proceeding
    if (!REWARD_CLAIM_CONTRACT_ADDRESS || !isValidAddress(REWARD_CLAIM_CONTRACT_ADDRESS)) {
      return NextResponse.json(
        { 
          ok: false, 
          error: `Reward contract not configured. Please set REWARD_CLAIM_CONTRACT_ADDRESS in Vercel environment variables. Current value: ${REWARD_CLAIM_CONTRACT_ADDRESS ? "Invalid format" : "Not set"}` 
        },
        { status: 500 }
      );
    }
    
    // Prepare transaction data for user to sign
    let txData;
    try {
      txData = await prepareClaimTransaction(fid, walletAddress, tokenAmount);
    } catch (error: any) {
      console.error("[Reward Claim] Error preparing transaction:", error);
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to prepare transaction. Please check contract configuration." },
        { status: 500 }
      );
    }
    
    if (!txData) {
      return NextResponse.json(
        { ok: false, error: "Failed to prepare transaction. Please ensure contract is deployed and configured." },
        { status: 500 }
      );
    }
    
    // Return transaction data for client to sign and send
    // Client will handle signing and sending, then call back to update database
    return NextResponse.json({
      ok: true,
      transaction: {
        to: txData.to,
        data: txData.data,
        value: txData.value.toString(),
      },
      tokenAmount: tokenAmount.toString(),
      tokenPrice,
      fid,
      dayId: getDayId(new Date()).toString(),
    });
  } catch (error: any) {
    console.error("[Reward Claim] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to claim reward" },
      { status: 500 }
    );
  }
}

/**
 * PUT endpoint to mark reward as claimed after user sends transaction.
 * Called by client after transaction is confirmed.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const fid = Number(body.fid);
    const txHash = body.txHash;
    
    if (!fid || isNaN(fid)) {
      return NextResponse.json(
        { ok: false, error: "Invalid fid" },
        { status: 400 }
      );
    }
    
    if (!txHash || typeof txHash !== "string") {
      return NextResponse.json(
        { ok: false, error: "Transaction hash is required" },
        { status: 400 }
      );
    }
    
    // Get user's check-in record
    const checkin = await getCheckinByFid(fid);
    if (!checkin) {
      return NextResponse.json(
        { ok: false, error: "No check-in record found" },
        { status: 400 }
      );
    }
    
    // Update check-in record to mark reward as claimed
    await updateCheckin(fid, {
      last_checkin: checkin.last_checkin!,
      streak: checkin.streak,
      total_checkins: checkin.total_checkins || 0,
      reward_claimed_at: new Date().toISOString(),
    });
    
    console.log(`[Reward Claim] FID ${fid}: Reward marked as claimed, tx: ${txHash}`);
    
    return NextResponse.json({
      ok: true,
      message: "Reward claimed successfully",
    });
  } catch (error: any) {
    console.error("[Reward Claim] PUT Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to update reward status" },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check if reward is available.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get("fid");
    
    if (!fidParam) {
      return NextResponse.json(
        { ok: false, error: "fid query parameter is required" },
        { status: 400 }
      );
    }
    
    const fid = Number(fidParam);
    if (!fid || isNaN(fid)) {
      return NextResponse.json(
        { ok: false, error: "Invalid fid" },
        { status: 400 }
      );
    }
    
    // Get user's check-in record
    const checkin = await getCheckinByFid(fid);
    if (!checkin) {
      return NextResponse.json({
        ok: true,
        canClaim: false,
        reason: "No check-in record",
      });
    }
    
    // Check if user has checked in today
    if (!checkin.last_checkin) {
      return NextResponse.json({
        ok: true,
        canClaim: false,
        reason: "Not checked in today",
      });
    }
    
    const lastCheckinDate = new Date(checkin.last_checkin);
    const today = new Date();
    const hasCheckedInToday = getCheckInDayId(lastCheckinDate) === getCheckInDayId(today);
    
    if (!hasCheckedInToday) {
      return NextResponse.json({
        ok: true,
        canClaim: false,
        reason: "Not checked in today",
      });
    }
    
    // Check if reward already claimed today
    let rewardClaimedToday = false;
    if (checkin.reward_claimed_at) {
      const claimedDate = new Date(checkin.reward_claimed_at);
      rewardClaimedToday = getCheckInDayId(claimedDate) === getCheckInDayId(today);
    }
    
    return NextResponse.json({
      ok: true,
      canClaim: !rewardClaimedToday,
      rewardClaimedToday,
    });
  } catch (error: any) {
    console.error("[Reward Claim] GET Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to check reward status" },
      { status: 500 }
    );
  }
}

