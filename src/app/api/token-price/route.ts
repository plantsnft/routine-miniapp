import { NextResponse } from "next/server";

// CATWALK token on Base
const TOKEN_ADDRESS = "0xa5eb1cad0dfc1c4f8d4f84f995aeda9a7a047b07";
const BASE_CHAIN_ID = "base";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ""; // Optional API key for BaseScan

// Helper to fetch holder count and transaction count from BaseScan
async function fetchTokenStats() {
  try {
    // Try BaseScan API (Etherscan-compatible for Base)
    // Base chain ID is 8453
    const apiKeyParam = BASESCAN_API_KEY ? `&apikey=${BASESCAN_API_KEY}` : "";
    
    // Get token info - this might include holder count
    // Note: BaseScan uses Etherscan API format
    const baseScanUrl = `https://api.basescan.org/api?module=token&action=tokeninfo&contractaddress=${TOKEN_ADDRESS}${apiKeyParam}`;
    
    const response = await fetch(baseScanUrl, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === "1" && data.result && data.result.length > 0) {
        const tokenInfo = data.result[0];
        let holders: number | null = null;
        
        // Try to parse holders count
        if (tokenInfo.holders) {
          holders = parseInt(tokenInfo.holders, 10);
        }

        // Try to get transaction count (token transfers)
        let transactionCount: number | null = null;
        try {
          // Get token transfer count using eth_getLogs for Transfer events
          // Transfer event signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
          const txCountUrl = `https://api.basescan.org/api?module=proxy&action=eth_getLogs&fromBlock=0&toBlock=latest&address=${TOKEN_ADDRESS}&topic0=0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef${apiKeyParam}`;
          
          const txResponse = await fetch(txCountUrl, {
            headers: {
              "User-Agent": "Catwalk-MiniApp",
            },
          });

          if (txResponse.ok) {
            const txData = await txResponse.json();
            if (txData.status === "1" && txData.result && Array.isArray(txData.result)) {
              // Count the number of transfer events (lifetime transactions)
              transactionCount = txData.result.length;
            }
          }
        } catch (txError) {
          console.log("[Token Stats] Transaction count fetch failed:", txError);
        }

        return {
          holders,
          transactions: transactionCount,
        };
      }
    }
  } catch (error) {
    console.log("[Token Stats] BaseScan API failed:", error);
  }

  return {
    holders: null,
    transactions: null,
  };
}

export async function GET() {
  try {
    // Fetch token stats (holders, transactions) in parallel
    const [tokenStats] = await Promise.all([
      fetchTokenStats(),
    ]);

    // Try DexScreener API first (free, no API key needed)
    try {
      const dexScreenerResponse = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`
      );

      if (dexScreenerResponse.ok) {
        const data = await dexScreenerResponse.json();
        
        if (data.pairs && data.pairs.length > 0) {
          // Find the pair on Base chain
          const basePair = data.pairs.find(
            (pair: any) => 
              pair.chainId === BASE_CHAIN_ID || 
              pair.chainId === "base" ||
              pair.dexId === "baseswap" ||
              pair.dexId === "uniswap-v3"
          ) || data.pairs[0]; // Fallback to first pair if no Base pair found

          if (basePair) {
            return NextResponse.json({
              price: parseFloat(basePair.priceUsd || "0"),
              priceChange24h: parseFloat(basePair.priceChange?.h24 || "0"),
              volume24h: parseFloat(basePair.volume?.h24 || "0"),
              liquidity: parseFloat(basePair.liquidity?.usd || "0"),
              holders: tokenStats.holders,
              transactions: tokenStats.transactions,
              symbol: basePair.baseToken?.symbol || "CATWALK",
              name: basePair.baseToken?.name || "Catwalk",
              address: TOKEN_ADDRESS,
              source: "dexscreener",
            });
          }
        }
      }
    } catch (dexError) {
      console.log("[Token Price] DexScreener failed:", dexError);
    }

    // Fallback: Try CoinGecko API (if token is listed)
    try {
      const coinGeckoResponse = await fetch(
        `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${TOKEN_ADDRESS}&vs_currencies=usd&include_24hr_change=true`
      );

      if (coinGeckoResponse.ok) {
        const data = await coinGeckoResponse.json();
        const tokenData = data[TOKEN_ADDRESS.toLowerCase()];

        if (tokenData) {
          return NextResponse.json({
            price: tokenData.usd || 0,
            priceChange24h: tokenData.usd_24h_change || 0,
            volume24h: null,
            liquidity: null,
            holders: tokenStats.holders,
            transactions: tokenStats.transactions,
            symbol: "CATWALK",
            name: "Catwalk",
            address: TOKEN_ADDRESS,
            source: "coingecko",
          });
        }
      }
    } catch (cgError) {
      console.log("[Token Price] CoinGecko failed:", cgError);
    }

    // If all APIs fail, return placeholder data
    return NextResponse.json({
      price: null,
      priceChange24h: null,
      volume24h: null,
      liquidity: null,
      holders: tokenStats.holders,
      transactions: tokenStats.transactions,
      symbol: "CATWALK",
      name: "Catwalk",
      address: TOKEN_ADDRESS,
      source: null,
      error: "Unable to fetch token data",
    });
  } catch (error: any) {
    console.error("[Token Price] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch token price" },
      { status: 500 }
    );
  }
}

