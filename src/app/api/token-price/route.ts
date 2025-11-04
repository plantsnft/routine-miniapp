import { NextResponse } from "next/server";

// CATWALK token on Base
const TOKEN_ADDRESS = "0xa5eb1cad0dfc1c4f8d4f84f995aeda9a7a047b07";
const BASE_CHAIN_ID = "base";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ""; // Optional API key for BaseScan

// Helper to fetch holder count and transaction count from BaseScan
async function fetchTokenStats() {
  const apiKeyParam = BASESCAN_API_KEY ? `&apikey=${BASESCAN_API_KEY}` : "";
  let holders: number | null = null;
  let transactions: number | null = null;

  try {
    // Method 1: Get token info (includes holder count if available)
    const tokenInfoUrl = `https://api.basescan.org/api?module=token&action=tokeninfo&contractaddress=${TOKEN_ADDRESS}${apiKeyParam}`;
    
    const tokenInfoResponse = await fetch(tokenInfoUrl, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    if (tokenInfoResponse.ok) {
      const tokenData = await tokenInfoResponse.json();
      if (tokenData.status === "1" && tokenData.result && tokenData.result.length > 0) {
        const info = tokenData.result[0];
        // Parse holder count - BaseScan might return it as a string
        if (info.holders) {
          holders = parseInt(String(info.holders).replace(/,/g, ""), 10) || null;
        }
      }
    }
  } catch (error) {
    console.log("[Token Stats] Token info fetch failed:", error);
  }

  // If we don't have holders from tokeninfo, try alternative method
  if (holders === null) {
    try {
      // Try the holder list endpoint to get holder count
      const holderListUrl = `https://api.basescan.org/api?module=token&action=tokenholderlist&contractaddress=${TOKEN_ADDRESS}&page=1&offset=100${apiKeyParam}`;
      
      const holderResponse = await fetch(holderListUrl, {
        headers: {
          "User-Agent": "Catwalk-MiniApp",
        },
      });

      if (holderResponse.ok) {
        const holderData = await holderResponse.json();
        if (holderData.status === "1" && holderData.result) {
          // Check if there's a total count in the response
          if (holderData.result.length > 0) {
            // If we get results, we know there are holders, but we need the total count
            // BaseScan might return total in a different field
            // For now, we'll need to use a different approach or accept that we can't get exact count
          }
        }
      }
    } catch (error) {
      console.log("[Token Stats] Holder count alternative fetch failed:", error);
    }
  }

  try {
    // Get transaction count using token transfer events
    // Transfer event signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    // Use eth_getLogs to get all Transfer events (lifetime transactions)
    const transferEventTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    
    // Try using the proxy endpoint to get logs
    // Note: This might be slow for tokens with many transfers, but it's the most accurate
    const txCountUrl = `https://api.basescan.org/api?module=proxy&action=eth_getLogs&fromBlock=0x0&toBlock=latest&address=${TOKEN_ADDRESS}&topic0=${transferEventTopic}${apiKeyParam}`;
    
    const txResponse = await fetch(txCountUrl, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    if (txResponse.ok) {
      const txData = await txResponse.json();
      if (txData.result && Array.isArray(txData.result)) {
        // Count all transfer events (each transfer is a transaction)
        transactions = txData.result.length;
      } else if (txData.error) {
        // If there's an error, log it but continue
        console.log("[Token Stats] Transaction count error:", txData.error);
      }
    }
  } catch (txError) {
    console.log("[Token Stats] Transaction count fetch failed:", txError);
  }

  return {
    holders,
    transactions,
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
            // Calculate market cap: price * total supply
            // For market cap calculation, we need total supply
            // Try to get it from the pair data or calculate from liquidity
            let marketCap: number | null = null;
            
            // Try to get market cap from pair data if available
            if (basePair.marketCap) {
              marketCap = parseFloat(basePair.marketCap);
            } else if (basePair.fdv) {
              // Fully diluted valuation is close to market cap
              marketCap = parseFloat(basePair.fdv);
            } else if (basePair.priceUsd && basePair.liquidity?.usd) {
              // Rough estimate: use liquidity as a proxy for market cap
              // This is not accurate but better than nothing
              marketCap = parseFloat(basePair.liquidity.usd) * 2; // Rough multiplier
            }

            const response = {
              price: parseFloat(basePair.priceUsd || "0"),
              priceChange24h: parseFloat(basePair.priceChange?.h24 || "0"),
              volume24h: parseFloat(basePair.volume?.h24 || "0"),
              liquidity: parseFloat(basePair.liquidity?.usd || "0"),
              marketCap,
              holders: tokenStats.holders,
              transactions: tokenStats.transactions,
              symbol: basePair.baseToken?.symbol || "CATWALK",
              name: basePair.baseToken?.name || "Catwalk",
              address: TOKEN_ADDRESS,
              source: "dexscreener",
            };
            
            console.log("[Token Price] DexScreener success:", response);
            return NextResponse.json(response);
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
            marketCap: null,
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
    console.log("[Token Price] All APIs failed, returning placeholder data");
    return NextResponse.json({
      price: null,
      priceChange24h: null,
      volume24h: null,
      liquidity: null,
      marketCap: null,
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

