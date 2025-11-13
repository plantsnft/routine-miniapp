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
const REWARD_LOW = 10_000n * TOKEN_UNIT;
const REWARD_MED = 20_000n * TOKEN_UNIT;
const REWARD_HIGH = 333_333n * TOKEN_UNIT;
const REWARD_CREATOR = 1_000_000n * TOKEN_UNIT;

const signerWallet = SIGNER_PRIVATE_KEY ? new ethers.Wallet(SIGNER_PRIVATE_KEY) : null;
if (signerWallet) {
  console.info("[Reward Claim] Loaded signer address:", signerWallet.address);
}
if (signerWallet && REWARD_SIGNER_ADDRESS) {
  const signerAddr = signerWallet.address.toLowerCase();
  if (signerAddr !== REWARD_SIGNER_ADDRESS.toLowerCase()) {
    console.warn(
      "[Reward Claim] Warning: REWARD_SIGNER_PRIVATE_KEY address does not match REWARD_SIGNER_ADDRESS env.",
      "signer=",
      signerAddr,
      "env=",
      REWARD_SIGNER_ADDRESS.toLowerCase(),
      "privateKeyPrefix=",
      SIGNER_PRIVATE_KEY.slice(0, 10),
      "fallbackPrefix=",
      process.env.PRIVATE_KEY?.slice(0, 10)
    );
  }
} else if (!process.env.REWARD_SIGNER_PRIVATE_KEY) {
  console.warn(
    "[Reward Claim] Warning: REWARD_SIGNER_PRIVATE_KEY not set. Falling back to PRIVATE_KEY."
  );
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

let publicClient: any = null;
function getPublicClient(): any {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });
  }
  return publicClient;
}

function isValidAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

type NeynarUserData = WebhookUserCreated["data"] | null;

async function fetchNeynarUser(fid: number): Promise<NeynarUserData> {
  try {
    const user = await getNeynarUser(fid);
    if (!user) {
      console.log(`[Reward Claim] No Neynar user found for FID ${fid}`);
      return null;
    }
    return user;
  } catch (error: any) {
    console.error(
      `[Reward Claim] Error fetching Neynar user for FID ${fid}:`,
      error?.message || error
    );
    return null;
  }
}

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

function getRewardAllocation(
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

function getDayId(timestamp: Date): bigint {
  const timestampSeconds = Math.floor(timestamp.getTime() / 1000);
  return BigInt(Math.floor(timestampSeconds / 86400));
}

async function prepareClaimTransaction(
  fid: number,
  tierIndex: number,
  dayId: bigint,
  signature: string
): Promise<{ to: string; data: string; value: bigint } | null> {
  if (!REWARD_CLAIM_CONTRACT_ADDRESS) {
    console.error(
      "[Reward Claim] REWARD_CLAIM_CONTRACT_ADDRESS not configured in environment variables"
    );
    throw new Error(
      "Reward contract address not configured. Please set REWARD_CLAIM_CONTRACT_ADDRESS in Vercel environment variables."
    );
  }

  if (!isValidAddress(REWARD_CLAIM_CONTRACT_ADDRESS)) {
    console.error(
      "[Reward Claim] Invalid contract address format:",
      REWARD_CLAIM_CONTRACT_ADDRESS
    );
    throw new Error(
      `Invalid contract address format. Expected 0x followed by 40 hex characters, got: ${REWARD_CLAIM_CONTRACT_ADDRESS.substring(
        0,
        20
      )}...`
    );
  }

  try {
    const data = encodeFunctionData({
      abi: rewardClaimAbi,
      functionName: "claim",
      args: [BigInt(fid), dayId, tierIndex, signature as `0x${string}`],
    });

    const contractAddress = REWARD_CLAIM_CONTRACT_ADDRESS.toLowerCase() as `0x${string}`;

    return {
      to: contractAddress,
      data: data as `0x${string}`,
      value: 0n,
    };
  } catch (error: any) {
    console.error("[Reward Claim] Error preparing transaction:", error.message);
    if (
      error.message.includes("not configured") ||
      error.message.includes("Invalid contract address")
    ) {
      throw error;
    }
    throw new Error(`Failed to prepare transaction: ${error.message}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fid = Number(body.fid);

    if (!fid || isNaN(fid)) {
      return NextResponse.json({ ok: false, error: "Invalid fid" }, { status: 400 });
    }

    const checkin = await getCheckinByFid(fid);
    if (!checkin) {
      return NextResponse.json(
        { ok: false, error: "No check-in record found. Please check in first." },
        { status: 400 }
      );
    }

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

    const neynarUser = await fetchNeynarUser(fid);
    const walletAddress = deriveWalletAddress(fid, neynarUser);
    if (!walletAddress) {
      return NextResponse.json(
        {
          ok: false,
          error: "No wallet address found. Please ensure you are logged in to Farcaster.",
        },
        { status: 400 }
      );
    }

    if (!REWARD_CLAIM_CONTRACT_ADDRESS || !isValidAddress(REWARD_CLAIM_CONTRACT_ADDRESS)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Reward contract not configured. Please set REWARD_CLAIM_CONTRACT_ADDRESS in Vercel environment variables. Current value: ${
            REWARD_CLAIM_CONTRACT_ADDRESS ? "Invalid format" : "Not set"
          }`,
        },
        { status: 500 }
      );
    }

    const dayId = getDayId(today);
    const alreadyClaimedOnChain = await hasUserClaimedOnChain(fid, dayId);
    if (alreadyClaimedOnChain) {
      if (!checkin.reward_claimed_at) {
        try {
          await markRewardClaimed(fid, today.toISOString(), { recordId: checkin.id ?? null });
        } catch (syncError: any) {
          console.error(
            "[Reward Claim] Failed to sync reward_claimed_at after on-chain check:",
            syncError?.message || syncError
          );
        }
      }

      return NextResponse.json(
        { ok: false, error: "Reward already claimed today." },
        { status: 409 }
      );
    }

    const { amount: tokenAmount, tierLabel, tierIndex, score } = getRewardAllocation(
      fid,
      neynarUser
    );
    const displayScore = Number.isFinite(score) ? score.toFixed(2) : "0.00";
    console.log(
      `[Reward Claim] FID ${fid}: Score ${displayScore} -> ${tierLabel} tier awarding ${tokenAmount.toString()} tokens`
    );

    const signature = await generateClaimSignature(fid, dayId, tierIndex, walletAddress);

    let txData;
    try {
      txData = await prepareClaimTransaction(fid, tierIndex, dayId, signature);
    } catch (error: any) {
      console.error("[Reward Claim] Error preparing transaction:", error);
      return NextResponse.json(
        {
          ok: false,
          error:
            error.message || "Failed to prepare transaction. Please check contract configuration.",
        },
        { status: 500 }
      );
    }

    if (!txData) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to prepare transaction. Please ensure contract is deployed and configured.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      transaction: {
        to: txData.to,
        data: txData.data,
        value: txData.value.toString(),
      },
      tokenAmount: tokenAmount.toString(),
      fid,
      dayId: dayId.toString(),
      rewardTier: tierLabel,
      rewardTierIndex: tierIndex,
      neynarScore: score,
      signature,
    });
  } catch (error: any) {
    console.error("[Reward Claim] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to claim reward" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const fid = Number(body.fid);
    const txHash = body.txHash;

    if (!fid || isNaN(fid)) {
      return NextResponse.json({ ok: false, error: "Invalid fid" }, { status: 400 });
    }

    if (!txHash || typeof txHash !== "string") {
      return NextResponse.json(
        { ok: false, error: "Transaction hash is required" },
        { status: 400 }
      );
    }

    const checkin = await getCheckinByFid(fid);
    if (!checkin) {
      return NextResponse.json({ ok: false, error: "No check-in record found" }, { status: 400 });
    }

    await markRewardClaimed(fid, new Date().toISOString(), { recordId: checkin.id ?? null });
    console.log(`[Reward Claim] FID ${fid}: Reward marked as claimed, tx: ${txHash}`);

    return NextResponse.json({ ok: true, message: "Reward claimed successfully" });
  } catch (error: any) {
    console.error("[Reward Claim] PUT Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to update reward status" },
      { status: 500 }
    );
  }
}

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
      return NextResponse.json({ ok: false, error: "Invalid fid" }, { status: 400 });
    }

    const checkin = await getCheckinByFid(fid);
    if (!checkin) {
      return NextResponse.json({
        ok: true,
        canClaim: false,
        reason: "No check-in record",
      });
    }

    if (!checkin.last_checkin) {
      return NextResponse.json({
        ok: true,
        canClaim: false,
        reason: "Not checked in today",
      });
    }

    const lastCheckinDate = new Date(checkin.last_checkin);
    const today = new Date();
    const dayId = getDayId(today);
    const hasCheckedInToday = getCheckInDayId(lastCheckinDate) === getCheckInDayId(today);

    if (!hasCheckedInToday) {
      return NextResponse.json({
        ok: true,
        canClaim: false,
        reason: "Not checked in today",
      });
    }

    let rewardClaimedToday = false;
    if (checkin.reward_claimed_at) {
      const claimedDate = new Date(checkin.reward_claimed_at);
      rewardClaimedToday = getCheckInDayId(claimedDate) === getCheckInDayId(today);
    }

    if (!rewardClaimedToday) {
      const claimedOnChain = await hasUserClaimedOnChain(fid, dayId);
      if (claimedOnChain) {
        rewardClaimedToday = true;
        if (!checkin.reward_claimed_at) {
          try {
            await markRewardClaimed(fid, today.toISOString(), { recordId: checkin.id ?? null });
          } catch (syncError: any) {
            console.error(
              "[Reward Claim] Failed to backfill reward_claimed_at from on-chain state:",
              syncError?.message || syncError
            );
          }
        }
      }
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

async function hasUserClaimedOnChain(fid: number, dayId: bigint): Promise<boolean> {
  if (!REWARD_CLAIM_CONTRACT_ADDRESS || !isValidAddress(REWARD_CLAIM_CONTRACT_ADDRESS)) {
    return false;
  }

  try {
    const client = getPublicClient();
    const claimedOnChain = await client.readContract({
      address: REWARD_CLAIM_CONTRACT_ADDRESS as `0x${string}`,
      abi: rewardClaimAbi,
      functionName: "hasClaimed",
      args: [BigInt(fid), dayId],
    });
    return Boolean(claimedOnChain);
  } catch (error: any) {
    console.error(
      `[Reward Claim] hasUserClaimedOnChain error for fid ${fid}:`,
      error?.message || error
    );
    return false;
  }
}