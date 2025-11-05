import { NextResponse } from "next/server";

// CATWALK token on Base - using checksummed address
const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
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
    // Method 1: Try tokens endpoint with lowercase address
    try {
      const tokenAddressLower = TOKEN_ADDRESS.toLowerCase();
      let dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddressLower}`;
      console.log("[Token Price] Fetching from DexScreener (tokens):", dexScreenerUrl);
      
      let dexScreenerResponse = await fetch(dexScreenerUrl, {
        headers: {
          "User-Agent": "Catwalk-MiniApp",
        },
      });

      console.log("[Token Price] DexScreener response status:", dexScreenerResponse.status);

      if (!dexScreenerResponse.ok) {
        const errorText = await dexScreenerResponse.text();
        console.error("[Token Price] DexScreener API error:", {
          status: dexScreenerResponse.status,
          statusText: dexScreenerResponse.statusText,
          body: errorText,
        });
        throw new Error(`DexScreener API returned ${dexScreenerResponse.status}: ${dexScreenerResponse.statusText}`);
      }

      let data = await dexScreenerResponse.json();
      
      console.log("[Token Price] DexScreener raw response:", JSON.stringify(data).substring(0, 500));
      
      // Check if data exists
      if (!data) {
        console.error("[Token Price] DexScreener returned null/undefined data");
        throw new Error("DexScreener returned no data");
      }

      // Process the data - pairs can be null, empty array, or have items
      let pairs = data.pairs;
      
      // If pairs is null, try using the pair endpoint directly (the URL format suggests it might be a pair address)
      if (pairs === null || (Array.isArray(pairs) && pairs.length === 0)) {
        console.log("[Token Price] Pairs is null/empty, trying pair endpoint directly");
        dexScreenerUrl = `https://api.dexscreener.com/latest/dex/pairs/base/${tokenAddressLower}`;
        console.log("[Token Price] Trying DexScreener pair endpoint:", dexScreenerUrl);
        
        dexScreenerResponse = await fetch(dexScreenerUrl, {
          headers: {
            "User-Agent": "Catwalk-MiniApp",
          },
        });
        
        if (dexScreenerResponse.ok) {
          const pairData = await dexScreenerResponse.json();
          if (pairData.pair) {
            // Single pair response
            pairs = [pairData.pair];
            data = { pairs };
            console.log("[Token Price] Found pair via pair endpoint");
          } else if (pairData.pairs && Array.isArray(pairData.pairs)) {
            pairs = pairData.pairs;
            data = pairData;
            console.log("[Token Price] Found pairs via pair endpoint");
          }
        }
      }
      
      const pairsCount = Array.isArray(pairs) ? pairs.length : (pairs === null ? 0 : 0);
      
      console.log("[Token Price] DexScreener pairs data:", {
        pairsType: pairs === null ? "null" : Array.isArray(pairs) ? "array" : typeof pairs,
        pairsCount,
        pairs: Array.isArray(pairs) ? pairs.slice(0, 3).map((p: any) => ({
          chainId: p.chainId,
          dexId: p.dexId,
          priceUsd: p.priceUsd,
          pairAddress: p.pairAddress,
        })) : [],
      });
      
      // Check if pairs array exists and has items (handle null case)
      if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
        console.warn("[Token Price] DexScreener returned null/empty pairs - will try fallback APIs");
        // Don't throw error, continue to fallback APIs
      } else if (Array.isArray(pairs) && pairs.length > 0) {
        // Find the pair on Base chain - prioritize Base pairs
        const basePairs = pairs.filter(
          (pair: any) => 
            pair.chainId === "base" || 
            pair.chainId === BASE_CHAIN_ID
        );
        
        // If we have Base pairs, use the one with highest liquidity, otherwise use first pair
        const basePair = basePairs.length > 0
          ? basePairs.reduce((best: any, current: any) => {
              const bestLiq = parseFloat(best.liquidity?.usd || "0");
              const currentLiq = parseFloat(current.liquidity?.usd || "0");
              return currentLiq > bestLiq ? current : best;
            })
          : pairs[0]; // Fallback to first pair if no Base pair found
        
        console.log("[Token Price] Selected pair:", {
          chainId: basePair.chainId,
          dexId: basePair.dexId,
          priceUsd: basePair.priceUsd,
          liquidity: basePair.liquidity?.usd,
          volume24h: basePair.volume?.h24,
        });

        if (basePair && basePair.priceUsd) {
          // Calculate market cap: price * total supply
          // For market cap calculation, we need total supply
          // Try to get it from the pair data or calculate from liquidity
          let marketCap: number | null = null;
          
          // Try to get market cap from pair data
          // DexScreener provides fdv (fully diluted valuation) which is market cap
          if (basePair.fdv) {
            marketCap = parseFloat(basePair.fdv);
          } else if (basePair.marketCap) {
            marketCap = parseFloat(basePair.marketCap);
          } else if (basePair.priceUsd && basePair.liquidity?.usd) {
            // Fallback: rough estimate from liquidity
            // This is not accurate but better than nothing
            marketCap = parseFloat(basePair.liquidity.usd) * 2;
          }

          // Extract price change - DexScreener uses priceChange24h or priceChange.h24
          const priceChange24h = basePair.priceChange24h 
            ? parseFloat(basePair.priceChange24h)
            : basePair.priceChange?.h24 
              ? parseFloat(basePair.priceChange.h24)
              : 0;

          const response = {
            price: parseFloat(basePair.priceUsd || "0"),
            priceChange24h,
            volume24h: parseFloat(basePair.volume?.h24 || basePair.volume24h || "0"),
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
    } catch (dexError: unknown) {
      const error = dexError as Error;
      console.error("[Token Price] DexScreener failed:", {
        message: error?.message,
        stack: error?.stack,
        error: error,
      });
      // Continue to fallback APIs
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

    // If all APIs fail, return placeholder data (but don't set error)
    // This allows the banner to still show token info even without price
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
      // Don't set error - let the UI handle missing price gracefully
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[Token Price] Fatal error:", {
      message: err?.message,
      stack: err?.stack,
      error: err,
    });
    return NextResponse.json(
      { 
        error: err?.message || "Failed to fetch token price",
        details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

