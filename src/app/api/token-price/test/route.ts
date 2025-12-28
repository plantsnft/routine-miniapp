import { NextResponse } from "next/server";

/**
 * Test endpoint to debug DexScreener API calls
 * Visit: /api/token-price/test
 */
export async function GET() {
  const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
  const PAIR_ADDRESS = "0xAcf65dDaF08570076D1Dfba9539f21ae5A30b8Bc";
  
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  // Test 1: Pair address endpoint (most reliable)
  try {
    const pairUrl = `https://api.dexscreener.com/latest/dex/pairs/base/${PAIR_ADDRESS.toLowerCase()}`;
    console.log("[Test] Fetching pair address:", pairUrl);
    const pairResponse = await fetch(pairUrl, {
      headers: { "User-Agent": "Catwalk-MiniApp" },
    });
    const pairData = await pairResponse.json() as any;
    
    results.tests.push({
      name: "Pair Address Endpoint",
      url: pairUrl,
      status: pairResponse.status,
      hasPair: !!pairData.pair,
      hasPairs: !!pairData.pairs,
      pairData: pairData.pair ? {
        chainId: pairData.pair.chainId,
        dexId: pairData.pair.dexId,
        priceUsd: pairData.pair.priceUsd,
        priceUsdType: typeof pairData.pair.priceUsd,
        priceUsdParsed: parseFloat(pairData.pair.priceUsd || "0"),
        priceChange24h: pairData.pair.priceChange24h,
        volume24h: pairData.pair.volume24h || pairData.pair.volume?.h24,
        fdv: pairData.pair.fdv,
        marketCap: pairData.pair.marketCap,
        liquidity: pairData.pair.liquidity?.usd,
        baseToken: pairData.pair.baseToken,
      } : null,
      rawResponse: pairData,
    });
  } catch (error: any) {
    results.tests.push({
      name: "Pair Address Endpoint",
      error: error.message,
    });
  }

  // Test 2: Token address endpoint
  try {
    const tokenUrl = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS.toLowerCase()}`;
    console.log("[Test] Fetching token address:", tokenUrl);
    const tokenResponse = await fetch(tokenUrl, {
      headers: { "User-Agent": "Catwalk-MiniApp" },
    });
    const tokenData = await tokenResponse.json() as any;
    
    results.tests.push({
      name: "Token Address Endpoint",
      url: tokenUrl,
      status: tokenResponse.status,
      pairsCount: tokenData.pairs?.length || 0,
      pairs: tokenData.pairs?.slice(0, 3).map((p: any) => ({
        chainId: p.chainId,
        dexId: p.dexId,
        priceUsd: p.priceUsd,
        priceUsdType: typeof p.priceUsd,
        priceUsdParsed: parseFloat(p.priceUsd || "0"),
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
    });
  } catch (error: any) {
    results.tests.push({
      name: "Token Address Endpoint",
      error: error.message,
    });
  }

  return NextResponse.json(results, { status: 200 });
}

