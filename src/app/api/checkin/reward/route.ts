import { NextRequest, NextResponse } from "next/server";
import { getCheckinByFid, markRewardClaimed } from "~/lib/supabase";
import { getCheckInDayId } from "~/lib/dateUtils";
import { getNeynarUser } from "~/lib/neynar";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";
import { ethers } from "ethers";
import { createPublicClient, encodeFunctionData, http } from "viem";
import { base } from "viem/chains";
import type { WebhookUserCreated } from "@neynar/nodejs-sdk";

const REWARD_CLAIM_CONTRACT_ADDRESS = process.env.REWARD_CLAIM_CONTRACT_ADDRESS || "";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const REWARD_SIGNER_ADDRESS = process.env.REWARD_SIGNER_ADDRESS || "";
const SIGNER_PRIVATE_KEY =
  process.env.REWARD_SIGNER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

const TOKEN_DECIMALS = 18n;
const TOKEN_UNIT = 10n ** TOKEN_DECIMALS;
const REWARD_LOW = 10000n * TOKEN_UNIT;
const REWARD_MED = 20000n * TOKEN_UNIT;
const REWARD_HIGH = 333333n * TOKEN_UNIT;
const REWARD_CREATOR = 1000000n * TOKEN_UNIT;

const signerWallet = SIGNER_PRIVATE_KEY ? new ethers.Wallet(SIGNER_PRIVATE_KEY) : null;

if (signerWallet && REWARD_SIGNER_ADDRESS) {
  const signerAddr = signerWallet.address.toLowerCase();
  if (signerAddr !== REWARD_SIGNER_ADDRESS.toLowerCase()) {
    console.warn(
      "[Reward Claim] Warning: REWARD_SIGNER_PRIVATE_KEY address does not match REWARD_SIGNER_ADDRESS env."
    );
  }
}

const rewardClaimAbi = [
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fid", type: "uint256" },
      { name: "dayId", type: "uint256" },
      { name: "tier", type: "uint8" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "hasClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "fid", type: "uint256" },
      { name: "dayId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// lazy public client
let publicClient: any = null;
function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });
  }
  return publicClient as ReturnType<typeof createPublicClient>;
}

/**
 * Validate Ethereum address format
 */
function isValidAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  // Ethereum address: 0x followed by 40 hex characters
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

type NeynarUserData = WebhookUserCreated["data"] | null;

/**
 * Fetch the Neynar user record for a given fid.
 * Returns null if the user is not found or the API call fails.
 */
async function fetchNeynarUser(fid: number): Promise<NeynarUserData> {
  try {
    const user = await getNeynarUser(fid);
    if (!user) {
      console.log(`[Reward Claim] No Neynar user found for FID ${fid}`);
      return null;
    }
    return user;
  } catch (error: any) {
    console.error(`[Reward Claim] Error fetching Neynar user for FID ${fid}:`, error?.message || error);
    return null;
  }
}

/**
 * Choose the best wallet address for a user (custodial first, then verified wallets).
 */
function deriveWalletAddress(fid: number, user: NeynarUserData): string | null {
  if (!user) {
    console.log(`[Reward Claim] FID ${fid}: No wallet address found (no Neynar user)`);
    return null;
  }

  if (user.custody_address) {
    console.log(`[Reward Claim] FID ${fid}: Using custodial address ${user.custody_address}`);
    return user.custody_address;
  }

  if (user.verified_addresses?.eth_addresses && user.verified_addresses.eth_addresses.length > 0) {
    const verifiedAddr = user.verified_addresses.eth_addresses[0];
    console.log(`[Reward Claim] FID ${fid}: Using verified address ${verifiedAddr}`);
    return verifiedAddr;
  }

  console.log(`[Reward Claim] FID ${fid}: No wallet address found (no custodial or verified address)`);
  return null;
}

function parseNeynarScore(user: NeynarUserData): number {
  if (!user) return 0;
  const rawScore =
    (user as any)?.score ?? (user as any)?.global_score ?? (user as any)?.rating ?? 0;
  const parsed = Number(rawScore);
  return Number.isFinite(parsed) ? parsed : 0;
}

type RewardTierLabel = "starter" | "growth" | "legend" | "creator";

const TIER_INDEX: Record<RewardTierLabel, number> = {
  starter: 0,
  growth: 1,
  legend: 2,
  creator: 3,
};

function determineReward(
  fid: number,
  user: NeynarUserData
): { amount: bigint; tierLabel: RewardTierLabel; tierIndex: number; score: number } {
  const score = parseNeynarScore(user);
  const isCreator = CATWALK_CREATOR_FIDS.includes(fid);

  if (isCreator) {
    return {
      amount: REWARD_CREATOR,
      tierLabel: "creator",
      tierIndex: TIER_INDEX.creator,
      score,
    };
  }

  if (score < 0.42) {
    return {
      amount: REWARD_LOW,
      tierLabel: "starter",
      tierIndex: TIER_INDEX.starter,
      score,
    };
  }

  if (score < 0.9) {
    return {
      amount: REWARD_MED,
      tierLabel: "growth",
      tierIndex: TIER_INDEX.growth,
      score,
    };
  }

  return {
    amount: REWARD_HIGH,
    tierLabel: "legend",
    tierIndex: TIER_INDEX.legend,
    score,
  };
}

async function generateClaimSignature(
  fid: number,
  dayId: bigint,
  tierIndex: number,
  claimant: string
): Promise<string> {
  if (!signerWallet) {
    throw new Error("Signer wallet not configured. Provide REWARD_SIGNER_PRIVATE_KEY.");
  }
  if (!REWARD_CLAIM_CONTRACT_ADDRESS) {
    throw new Error("REWARD_CLAIM_CONTRACT_ADDRESS missing.");
  }

  const digest = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint8", "address"],
    [REWARD_CLAIM_CONTRACT_ADDRESS, fid, dayId, tierIndex, claimant]
  );

  return signerWallet.signMessage(ethers.getBytes(digest));
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
  tierIndex: number,
  dayId: bigint,
  signature: string
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
    // Encode function call
    const data = encodeFunctionData({
      abi: rewardClaimAbi,
      functionName: "claim",
      args: [BigInt(fid), dayId, tierIndex, signature as `0x${string}`],
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
񰀀