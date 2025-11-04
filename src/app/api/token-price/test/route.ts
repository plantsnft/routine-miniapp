import { NextResponse } from "next/server";

/**
 * Test endpoint to debug DexScreener API calls
 * Visit: /api/token-price/test
 */
export async function GET() {
  const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
  const url = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`;
  
  try {
    console.log("[Test] Fetching from DexScreener:", url);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    console.log("[Test] Response status:", response.status);
    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      url,
      status: response.status,
      data: {
        pairsCount: data.pairs?.length || 0,
        pairs: data.pairs?.slice(0, 3).map((p: any) => ({
          chainId: p.chainId,
          dexId: p.dexId,
          priceUsd: p.priceUsd,
          priceChange24h: p.priceChange24h || p.priceChange?.h24,
          volume24h: p.volume24h || p.volume?.h24,
          fdv: p.fdv,
          marketCap: p.marketCap,
          liquidity: p.liquidity?.usd,
          baseToken: {
            symbol: p.baseToken?.symbol,
            name: p.baseToken?.name,
          },
        })) || [],
        rawResponse: data,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      url,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}

