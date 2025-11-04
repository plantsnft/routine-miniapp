import { NextResponse } from "next/server";

// CATWALK token on Base
const TOKEN_ADDRESS = "0xa5eb1cad0dfc1c4f8d4f84f995aeda9a7a047b07";
const BASE_CHAIN_ID = "base";

export async function GET() {
  try {
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

