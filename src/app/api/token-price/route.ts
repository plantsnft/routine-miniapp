import { NextResponse } from "next/server";

// CATWALK token on Base - using checksummed address
const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
// Uniswap V3 pair address for CATWALK/WETH on Base (found from DexScreener)
const PAIR_ADDRESS = "0xAcf65dDaF08570076D1Dfba9539f21ae5A30b8Bc";
const BASE_CHAIN_ID = "base";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ""; // Optional API key for BaseScan
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base

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
        if (info.holders) {
          holders = parseInt(String(info.holders).replace(/,/g, ""), 10) || null;
        }
      }
    }
  } catch (error) {
    console.log("[Token Stats] Token info fetch failed:", error);
  }

  try {
    // Get transaction count using token transfer events
    const transferEventTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const txCountUrl = `https://api.basescan.org/api?module=proxy&action=eth_getLogs&fromBlock=0x0&toBlock=latest&address=${TOKEN_ADDRESS}&topic0=${transferEventTopic}${apiKeyParam}`;
    
    const txResponse = await fetch(txCountUrl, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    if (txResponse.ok) {
      const txData = await txResponse.json();
      if (txData.result && Array.isArray(txData.result)) {
        transactions = txData.result.length;
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

// Helper to find Uniswap V3 pair address using BaseScan
async function findUniswapPairAddress(): Promise<string | null> {
  try {
    const apiKeyParam = BASESCAN_API_KEY ? `&apikey=${BASESCAN_API_KEY}` : "";
    // Uniswap V3 Factory on Base: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD
    // Look for PoolCreated events
    const factoryAddress = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
    const poolCreatedTopic = "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118";
    
    // Search for PoolCreated events that include our token
    const logsUrl = `https://api.basescan.org/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=${factoryAddress}&topic0=${poolCreatedTopic}&topic0_1_opr=and&topic1=0x000000000000000000000000${TOKEN_ADDRESS.slice(2).toLowerCase()}${apiKeyParam}`;
    
    const response = await fetch(logsUrl, {
      headers: {
        "User-Agent": "Catwalk-MiniApp",
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === "1" && data.result && data.result.length > 0) {
        // Get the most recent pool creation
        const latestLog = data.result[data.result.length - 1];
        // Pool address is in topic2
        if (latestLog.topics && latestLog.topics[2]) {
          const pairAddress = "0x" + latestLog.topics[2].slice(-40);
          console.log("[Token Price] Found pair address:", pairAddress);
          return pairAddress;
        }
      }
    }
  } catch (error) {
    console.log("[Token Price] Error finding pair address:", error);
  }
  return null;
}

export async function GET() {
  try {
    // Fetch token stats (holders, transactions) in parallel
    const [tokenStats] = await Promise.all([
      fetchTokenStats(),
    ]);

    const tokenAddressLower = TOKEN_ADDRESS.toLowerCase();
    const pairAddressLower = PAIR_ADDRESS.toLowerCase();
    let pairs: any[] | null = null;
    let foundPair = false;

    // Strategy 1: Use the known pair address directly (most reliable)
    try {
      const pairAddressUrl = `https://api.dexscreener.com/latest/dex/pairs/base/${pairAddressLower}`;
      console.log("[Token Price] Fetching from DexScreener (known pair address):", pairAddressUrl);
      
      const pairResponse = await fetch(pairAddressUrl, {
        headers: {
          "User-Agent": "Catwalk-MiniApp",
        },
      });

      if (pairResponse.ok) {
        const pairData = await pairResponse.json();
        console.log("[Token Price] Pair endpoint response:", JSON.stringify(pairData).substring(0, 500));
        
        // DexScreener pair endpoint can return either { pair: {...} } or { pairs: [...] }
        if (pairData.pair) {
          // Check if pair has valid price data
          if (pairData.pair.priceUsd && parseFloat(pairData.pair.priceUsd) > 0) {
            pairs = [pairData.pair];
            foundPair = true;
            console.log("[Token Price] Found pair using known pair address with price:", pairData.pair.priceUsd);
          } else {
            console.log("[Token Price] Pair found but no valid price:", pairData.pair.priceUsd);
          }
        } else if (pairData.pairs) {
          if (Array.isArray(pairData.pairs) && pairData.pairs.length > 0) {
            // Filter for pairs with valid prices
            const validPairs = pairData.pairs.filter((p: any) => p.priceUsd && parseFloat(p.priceUsd) > 0);
            if (validPairs.length > 0) {
              pairs = validPairs;
              foundPair = true;
              console.log("[Token Price] Found pairs array using known pair address:", validPairs.length);
            } else {
              console.log("[Token Price] Pairs found but none have valid prices");
            }
          } else if (pairData.pairs === null) {
            console.log("[Token Price] Pair endpoint returned null pairs");
          }
        }
      } else {
        const errorText = await pairResponse.text();
        console.log("[Token Price] Pair endpoint returned status:", pairResponse.status, errorText.substring(0, 200));
      }
    } catch (error) {
      console.log("[Token Price] Known pair address endpoint failed:", error);
    }

    // Strategy 2: Try DexScreener with token address (tokens endpoint) as fallback
    if (!foundPair) {
      try {
        const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddressLower}`;
        console.log("[Token Price] Fetching from DexScreener (tokens endpoint):", dexScreenerUrl);
        
        const dexScreenerResponse = await fetch(dexScreenerUrl, {
          headers: {
            "User-Agent": "Catwalk-MiniApp",
          },
        });

        if (dexScreenerResponse.ok) {
          const data = await dexScreenerResponse.json();
          console.log("[Token Price] DexScreener tokens response:", JSON.stringify(data).substring(0, 300));
          
          if (data.pairs && Array.isArray(data.pairs) && data.pairs.length > 0) {
            pairs = data.pairs;
            foundPair = true;
            console.log("[Token Price] Found pairs via tokens endpoint:", data.pairs.length);
          }
        }
      } catch (error) {
        console.log("[Token Price] DexScreener tokens endpoint failed:", error);
      }
    }

    // Strategy 3: Try token address as pair address (in case DexScreener URL format is different)
    if (!foundPair) {
      try {
        const pairAddressUrl = `https://api.dexscreener.com/latest/dex/pairs/base/${tokenAddressLower}`;
        console.log("[Token Price] Trying token address as pair:", pairAddressUrl);
        
        const pairResponse = await fetch(pairAddressUrl, {
          headers: {
            "User-Agent": "Catwalk-MiniApp",
          },
        });

        if (pairResponse.ok) {
          const pairData = await pairResponse.json();
          console.log("[Token Price] Token-as-pair endpoint response:", JSON.stringify(pairData).substring(0, 300));
          
          if (pairData.pair) {
            pairs = [pairData.pair];
            foundPair = true;
            console.log("[Token Price] Found pair using token address as pair");
          } else if (pairData.pairs && Array.isArray(pairData.pairs) && pairData.pairs.length > 0) {
            pairs = pairData.pairs;
            foundPair = true;
            console.log("[Token Price] Found pairs array using token address as pair");
          }
        }
      } catch (error) {
        console.log("[Token Price] Token-as-pair endpoint failed:", error);
      }
    }

    // Strategy 3: Try to find actual pair address and use it
    if (!foundPair) {
      try {
        const actualPairAddress = await findUniswapPairAddress();
        if (actualPairAddress) {
          const pairUrl = `https://api.dexscreener.com/latest/dex/pairs/base/${actualPairAddress.toLowerCase()}`;
          console.log("[Token Price] Trying found pair address:", pairUrl);
          
          const pairResponse = await fetch(pairUrl, {
            headers: {
              "User-Agent": "Catwalk-MiniApp",
            },
          });

          if (pairResponse.ok) {
            const pairData = await pairResponse.json();
            if (pairData.pair) {
              pairs = [pairData.pair];
              foundPair = true;
              console.log("[Token Price] Found pair using discovered pair address");
            }
          }
        }
      } catch (error) {
        console.log("[Token Price] Finding pair address failed:", error);
      }
    }

    // Process pairs if found
    if (foundPair && pairs && Array.isArray(pairs) && pairs.length > 0) {
      // Find the pair on Base chain with highest liquidity
      const basePairs = pairs.filter(
        (pair: any) => pair.chainId === "base" || pair.chainId === BASE_CHAIN_ID
      );
      
      const selectedPair = basePairs.length > 0
        ? basePairs.reduce((best: any, current: any) => {
            const bestLiq = parseFloat(best.liquidity?.usd || "0");
            const currentLiq = parseFloat(current.liquidity?.usd || "0");
            return currentLiq > bestLiq ? current : best;
          })
        : pairs[0];

      if (selectedPair && selectedPair.priceUsd) {
        // Handle very small numbers and scientific notation
        const priceStr = String(selectedPair.priceUsd);
        const price = parseFloat(priceStr) || 0;
        
        // Log for debugging
        console.log("[Token Price] Selected pair price:", {
          priceUsd: selectedPair.priceUsd,
          priceUsdType: typeof selectedPair.priceUsd,
          priceStr,
          priceParsed: price,
          isValid: price > 0,
        });
        
        // Only proceed if we have a valid price
        if (price > 0) {
          const priceChange24h = selectedPair.priceChange24h 
            ? parseFloat(String(selectedPair.priceChange24h))
            : selectedPair.priceChange?.h24 
              ? parseFloat(String(selectedPair.priceChange.h24))
              : 0;

          let marketCap: number | null = null;
          if (selectedPair.fdv) {
            marketCap = parseFloat(String(selectedPair.fdv));
          } else if (selectedPair.marketCap) {
            marketCap = parseFloat(String(selectedPair.marketCap));
          }

          const response = {
            price,
            priceChange24h,
            volume24h: parseFloat(String(selectedPair.volume?.h24 || selectedPair.volume24h || "0")),
            liquidity: parseFloat(String(selectedPair.liquidity?.usd || "0")),
            marketCap,
            holders: tokenStats.holders,
            transactions: tokenStats.transactions,
            symbol: selectedPair.baseToken?.symbol || "CATWALK",
            name: selectedPair.baseToken?.name || "Catwalk",
            address: TOKEN_ADDRESS,
            source: "dexscreener",
          };
          
          console.log("[Token Price] DexScreener success:", response);
          return NextResponse.json(response);
        } else {
          console.log("[Token Price] Price is 0 or invalid, continuing to fallback strategies");
        }
      } else {
        console.log("[Token Price] Selected pair has no priceUsd field:", selectedPair);
      }
    }

    // Strategy 5: Try to get price from Uniswap V3 pool reserves using BaseScan
    try {
      const apiKeyParam = BASESCAN_API_KEY ? `&apikey=${BASESCAN_API_KEY}` : "";
      
      // First, get token0 and token1 addresses to determine order
      const token0Selector = "0x0dfe1681"; // token0() function selector
      const token1Selector = "0xd21220a7"; // token1() function selector
      
      const [token0Res, token1Res] = await Promise.all([
        fetch(`https://api.basescan.org/api?module=proxy&action=eth_call&to=${PAIR_ADDRESS}&data=${token0Selector}&tag=latest${apiKeyParam}`, {
          headers: { "User-Agent": "Catwalk-MiniApp" },
        }),
        fetch(`https://api.basescan.org/api?module=proxy&action=eth_call&to=${PAIR_ADDRESS}&data=${token1Selector}&tag=latest${apiKeyParam}`, {
          headers: { "User-Agent": "Catwalk-MiniApp" },
        }),
      ]);

      if (token0Res.ok && token1Res.ok) {
        const token0Data = await token0Res.json();
        const token1Data = await token1Res.json();
        
        if (token0Data.result && token1Data.result) {
          // Extract token addresses (last 40 chars of 64-char hex string)
          const token0Addr = "0x" + token0Data.result.slice(-40);
          const token1Addr = "0x" + token1Data.result.slice(-40);
          
          const isToken0 = token0Addr.toLowerCase() === TOKEN_ADDRESS.toLowerCase();
          const isToken1 = token1Addr.toLowerCase() === TOKEN_ADDRESS.toLowerCase();
          
          if (!isToken0 && !isToken1) {
            console.log("[Token Price] Pool doesn't contain CATWALK token");
          } else {
            // Get slot0 which contains sqrtPriceX96
            const slot0Selector = "0x3850c7bd"; // slot0() function selector
            const slot0Res = await fetch(`https://api.basescan.org/api?module=proxy&action=eth_call&to=${PAIR_ADDRESS}&data=${slot0Selector}&tag=latest${apiKeyParam}`, {
              headers: { "User-Agent": "Catwalk-MiniApp" },
            });

            if (slot0Res.ok) {
              const slot0Data = await slot0Res.json();
              if (slot0Data.result && slot0Data.result !== "0x") {
                // Parse sqrtPriceX96 from slot0 (first 32 bytes = 64 hex chars)
                const sqrtPriceX96Hex = slot0Data.result.slice(2, 66);
                const sqrtPriceX96 = BigInt("0x" + sqrtPriceX96Hex);
                
                // Calculate price: (sqrtPriceX96 / 2^96)^2
                const Q96 = BigInt(2) ** BigInt(96);
                const priceRatio = Number(sqrtPriceX96 * sqrtPriceX96) / Number(Q96 * Q96);
                
                // Calculate price in USD
                // priceRatio = token1Amount / token0Amount (in raw units)
                // To get CATWALK price in USDC, we need to adjust for decimals
                // CATWALK has 18 decimals, USDC has 6 decimals
                let price: number;
                if (isToken0) {
                  // CATWALK is token0, USDC is token1
                  // priceRatio = USDC / CATWALK, so we need 1/priceRatio to get CATWALK/USDC
                  // Adjust for decimals: (1/priceRatio) * (10^18 / 10^6) = (1/priceRatio) * 10^12
                  price = (1 / priceRatio) * Math.pow(10, 18 - 6);
                } else {
                  // USDC is token0, CATWALK is token1
                  // priceRatio = CATWALK / USDC, so we need priceRatio to get CATWALK/USDC
                  // Adjust for decimals: priceRatio * (10^18 / 10^6) = priceRatio * 10^12
                  price = priceRatio * Math.pow(10, 18 - 6);
                }
                
                if (price > 0 && price < 1000 && !isNaN(price) && isFinite(price)) {
                  console.log("[Token Price] Calculated price from pool reserves:", price, { isToken0, priceRatio });
                  
                  return NextResponse.json({
                    price,
                    priceChange24h: null,
                    volume24h: null,
                    liquidity: null,
                    marketCap: null,
                    holders: tokenStats.holders,
                    transactions: tokenStats.transactions,
                    symbol: "CATWALK",
                    name: "Catwalk",
                    address: TOKEN_ADDRESS,
                    source: "basescan-pool-reserves",
                  });
                }
              }
            }
          }
        }
      }
    } catch (poolReservesError) {
      console.log("[Token Price] Pool reserves calculation failed:", poolReservesError);
    }

    // Strategy 6: Try Uniswap V3 API directly (quote endpoint)
    try {
      // Uniswap V3 Router on Base: 0x2626664c2603336E57B271c5C0b26F421741e481
      // Use Uniswap's quote API
      const uniswapQuoteUrl = `https://api.uniswap.org/v1/quote?tokenInAddress=${USDC_ADDRESS}&tokenInChainId=8453&tokenOutAddress=${TOKEN_ADDRESS}&tokenOutChainId=8453&amount=1000000&type=exactIn`;
      
      const quoteResponse = await fetch(uniswapQuoteUrl, {
        headers: {
          "User-Agent": "Catwalk-MiniApp",
        },
      });

      if (quoteResponse.ok) {
        const quoteData = await quoteResponse.json();
        // Calculate price from quote (amount in USDC / amount out in tokens)
        // This gives us price per token
        if (quoteData.quote && quoteData.quote.amount && quoteData.quote.amountOut) {
          const amountIn = parseFloat(quoteData.quote.amount) / 1e6; // USDC has 6 decimals
          const amountOut = parseFloat(quoteData.quote.amountOut) / 1e18; // Assuming 18 decimals for CATWALK
          const price = amountIn / amountOut;
          
          if (price > 0) {
            console.log("[Token Price] Uniswap quote API success:", price);
            return NextResponse.json({
              price,
              priceChange24h: null,
              volume24h: null,
              liquidity: null,
              marketCap: null,
              holders: tokenStats.holders,
              transactions: tokenStats.transactions,
              symbol: "CATWALK",
              name: "Catwalk",
              address: TOKEN_ADDRESS,
              source: "uniswap-quote",
            });
          }
        }
      }
    } catch (uniswapError) {
      console.log("[Token Price] Uniswap quote API failed:", uniswapError);
    }

    // Strategy 7: Try BaseScan to get token price via recent swaps
    try {
      const apiKeyParam = BASESCAN_API_KEY ? `&apikey=${BASESCAN_API_KEY}` : "";
      // Get recent token transfers to USDC pair or from USDC pair
      // This is a fallback - we'll estimate price from recent swaps
      const recentTxsUrl = `https://api.basescan.org/api?module=account&action=tokentx&contractaddress=${TOKEN_ADDRESS}&page=1&offset=10&sort=desc${apiKeyParam}`;
      
      const txsResponse = await fetch(recentTxsUrl, {
        headers: {
          "User-Agent": "Catwalk-MiniApp",
        },
      });

      if (txsResponse.ok) {
        // If we have transaction data, we could calculate price from swaps
        // But this is complex, so we'll skip for now
      }
    } catch (basescanError) {
      console.log("[Token Price] BaseScan price calculation failed:", basescanError);
    }

    // Strategy 8: Try CoinGecko as final fallback
    try {
      const coinGeckoResponse = await fetch(
        `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${tokenAddressLower}&vs_currencies=usd&include_24hr_change=true`
      );

      if (coinGeckoResponse.ok) {
        const data = await coinGeckoResponse.json();
        const tokenData = data[tokenAddressLower];

        if (tokenData && tokenData.usd) {
          return NextResponse.json({
            price: tokenData.usd,
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

    // If all strategies fail, return data without price but with other stats
    console.log("[Token Price] All strategies failed, returning data without price");
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
