import { NextResponse } from "next/server";

const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"; // CATWALK on Base
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

interface RecentPurchase {
  buyerAddress: string;
  amount: string;
  timestamp: number;
  fid?: number;
  username?: string;
  displayName?: string;
}

/**
 * GET endpoint to fetch recent token purchases.
 * Returns the most recent purchase with buyer's Farcaster info if available.
 */
export async function GET() {
  try {
    const apiKeyParam = BASESCAN_API_KEY ? `&apikey=${BASESCAN_API_KEY}` : "";
    
    // Get recent transfer events (buys) - query last 1000 blocks
    // We need to get the latest block number first, then query backwards
    const transferEventTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    
    // First, get the latest block number
    const latestBlockUrl = `https://api.basescan.org/api?module=proxy&action=eth_blockNumber${apiKeyParam}`;
    const latestBlockRes = await fetch(latestBlockUrl, {
      headers: { "User-Agent": "Catwalk-MiniApp" },
    });
    
    let fromBlock = "latest";
    if (latestBlockRes.ok) {
      try {
        const blockData = await latestBlockRes.json() as any;
        if (blockData.result) {
          const latestBlock = parseInt(blockData.result, 16);
          // Query last 10000 blocks (roughly last few hours)
          const blocksToQuery = 10000;
          const startBlock = Math.max(0, latestBlock - blocksToQuery);
          fromBlock = `0x${startBlock.toString(16)}`;
        }
      } catch (_e) {
        console.log("[Recent Purchases] Could not parse latest block, using 'latest'");
      }
    }
    
    const url = `https://api.basescan.org/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=latest&address=${TOKEN_ADDRESS}&topic0=${transferEventTopic}&page=1&offset=10${apiKeyParam}`;
    
    console.log("[Recent Purchases] Fetching from URL:", url);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    if (!response.ok) {
      console.error("[Recent Purchases] API request failed:", response.status, response.statusText);
      return NextResponse.json({
        ok: true,
        latestPurchase: null,
      });
    }

    const data = await response.json() as any;
    console.log("[Recent Purchases] BaseScan response:", {
      status: data.status,
      resultLength: data.result?.length,
      message: data.message,
    });
    
    if (data.status !== "1" || !data.result || !Array.isArray(data.result) || data.result.length === 0) {
      console.log("[Recent Purchases] No transfer events found");
      return NextResponse.json({
        ok: true,
        latestPurchase: null,
      });
    }

    // Get the most recent transfer
    // BaseScan returns results in reverse chronological order (latest first)
    const latestTransfer = data.result[0];
    
    console.log("[Recent Purchases] Latest transfer:", {
      blockNumber: latestTransfer.blockNumber,
      topics: latestTransfer.topics?.length,
      data: latestTransfer.data,
    });
    
    // Extract buyer address (to field in transfer event)
    // Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
    // topic0 = Transfer event signature
    // topic1 = from address (indexed)
    // topic2 = to address (indexed)
    // data = value (amount)
    const buyerAddress = latestTransfer.topics && latestTransfer.topics[2]
      ? "0x" + latestTransfer.topics[2].slice(26)
      : "";
    
    if (!buyerAddress) {
      console.error("[Recent Purchases] Could not extract buyer address from transfer event");
      return NextResponse.json({
        ok: true,
        latestPurchase: null,
      });
    }
    const amountHex = latestTransfer.data || "0x0";
    const blockNumber = parseInt(latestTransfer.blockNumber, 16);
    
    // Convert amount from wei (18 decimals)
    const amount = BigInt(amountHex);
    const decimals = BigInt(10 ** 18);
    const wholePart = amount / decimals;
    const fractionalPart = amount % decimals;
    
    const fractionalStr = fractionalPart.toString().padStart(18, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    const amountFormatted = trimmedFractional === '' 
      ? wholePart.toString() 
      : `${wholePart}.${trimmedFractional}`;

    // Note: Looking up Farcaster users by verified address is not directly supported
    // by Neynar API. We'll just return the address for now.
    // This could be enhanced later by maintaining a mapping of addresses to FIDs
    // or by using a different approach.

    const latestPurchase: RecentPurchase = {
      buyerAddress,
      amount: amountFormatted,
      timestamp: blockNumber, // Using block number as proxy for timestamp
    };

    return NextResponse.json({
      ok: true,
      latestPurchase,
    });
  } catch (error: any) {
    console.error("[API] /api/recent-purchases error:", error);
    return NextResponse.json({
      ok: true,
      latestPurchase: null,
    });
  }
}

