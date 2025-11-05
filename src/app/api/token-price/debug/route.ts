import { NextResponse } from "next/server";

const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
const PAIR_ADDRESS = "0xAcf65dDaF08570076D1Dfba9539f21ae5A30b8Bc";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  // Test 1: Check token0 and token1 of the pool
  try {
    const token0Selector = "0x0dfe1681";
    const token1Selector = "0xd21220a7";
    
    const [token0Res, token1Res] = await Promise.all([
      fetch(`https://api.basescan.org/api?module=proxy&action=eth_call&to=${PAIR_ADDRESS}&data=${token0Selector}&tag=latest`),
      fetch(`https://api.basescan.org/api?module=proxy&action=eth_call&to=${PAIR_ADDRESS}&data=${token1Selector}&tag=latest`),
    ]);

    if (token0Res.ok && token1Res.ok) {
      const token0Data = await token0Res.json();
      const token1Data = await token1Res.json();
      
      if (token0Data.result && token1Data.result) {
        const token0Addr = "0x" + token0Data.result.slice(-40);
        const token1Addr = "0x" + token1Data.result.slice(-40);
        
        results.tests.push({
          name: "Pool Token Addresses",
          token0: token0Addr,
          token1: token1Addr,
          isToken0CATWALK: token0Addr.toLowerCase() === TOKEN_ADDRESS.toLowerCase(),
          isToken1CATWALK: token1Addr.toLowerCase() === TOKEN_ADDRESS.toLowerCase(),
          isToken0USDC: token0Addr.toLowerCase() === USDC_ADDRESS.toLowerCase(),
          isToken1USDC: token1Addr.toLowerCase() === USDC_ADDRESS.toLowerCase(),
        });
      }
    }
  } catch (error: any) {
    results.tests.push({
      name: "Pool Token Addresses",
      error: error.message,
    });
  }

  // Test 2: Get slot0
  try {
    const slot0Selector = "0x3850c7bd";
    const slot0Res = await fetch(`https://api.basescan.org/api?module=proxy&action=eth_call&to=${PAIR_ADDRESS}&data=${slot0Selector}&tag=latest`);
    
    if (slot0Res.ok) {
      const slot0Data = await slot0Res.json();
      if (slot0Data.result && slot0Data.result !== "0x") {
        const sqrtPriceX96Hex = slot0Data.result.slice(2, 66);
        const sqrtPriceX96 = BigInt("0x" + sqrtPriceX96Hex);
        const Q96 = BigInt(2) ** BigInt(96);
        const priceRatio = Number(sqrtPriceX96 * sqrtPriceX96) / Number(Q96 * Q96);
        
        results.tests.push({
          name: "Pool Slot0",
          sqrtPriceX96: sqrtPriceX96.toString(),
          priceRatio,
          rawResult: slot0Data.result.substring(0, 200),
        });
      }
    }
  } catch (error: any) {
    results.tests.push({
      name: "Pool Slot0",
      error: error.message,
    });
  }

  // Test 3: Try DexScreener with pair address
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${PAIR_ADDRESS.toLowerCase()}`);
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      results.tests.push({
        name: "DexScreener Pair",
        hasPair: !!dexData.pair,
        hasPairs: !!dexData.pairs,
        pairPrice: dexData.pair?.priceUsd,
        pairsCount: dexData.pairs?.length || 0,
        rawResponse: JSON.stringify(dexData).substring(0, 500),
      });
    }
  } catch (error: any) {
    results.tests.push({
      name: "DexScreener Pair",
      error: error.message,
    });
  }

  // Test 4: Try DexScreener with token address
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS.toLowerCase()}`);
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      results.tests.push({
        name: "DexScreener Token",
        pairsCount: dexData.pairs?.length || 0,
        firstPairPrice: dexData.pairs?.[0]?.priceUsd,
        firstPairAddress: dexData.pairs?.[0]?.pairAddress,
        rawResponse: JSON.stringify(dexData).substring(0, 500),
      });
    }
  } catch (error: any) {
    results.tests.push({
      name: "DexScreener Token",
      error: error.message,
    });
  }

  return NextResponse.json(results);
}

