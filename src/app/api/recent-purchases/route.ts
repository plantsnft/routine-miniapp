import { NextResponse } from "next/server";

const TOKEN_ADDRESS = "0xa5eb1cad0dfc1c4f8d4f84f995aeda9a7a047b07"; // CATWALK on Base
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
    
    // Get recent transfer events (buys) - limit to most recent 10
    const transferEventTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const url = `https://api.basescan.org/api?module=logs&action=getLogs&fromBlock=latest&toBlock=latest&address=${TOKEN_ADDRESS}&topic0=${transferEventTopic}&page=1&offset=10${apiKeyParam}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        ok: true,
        latestPurchase: null,
      });
    }

    const data = await response.json();
    
    if (data.status !== "1" || !data.result || !Array.isArray(data.result) || data.result.length === 0) {
      return NextResponse.json({
        ok: true,
        latestPurchase: null,
      });
    }

    // Get the most recent transfer (first in array)
    const latestTransfer = data.result[0];
    
    // Extract buyer address (to field in transfer event)
    // Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
    // topic0 = Transfer event signature
    // topic1 = from address
    // topic2 = to address
    // data = value (amount)
    const buyerAddress = "0x" + latestTransfer.topics[2]?.slice(26) || "";
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

