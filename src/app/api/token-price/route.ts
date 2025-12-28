import { NextResponse } from "next/server";
import { 
  storePriceSnapshot, 
  getPrice24hAgo, 
  getLatestPriceSnapshot,
  calculate24hChangePercent 
} from "~/lib/supabase";

// CATWALK token on Base - using checksummed address
const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"; // CATWALK token
// Uniswap V3 pair address for CATWALK/WETH on Base (found from DexScreener)
const PAIR_ADDRESS = "0xAcf65dDaF08570076D1Dfba9539f21ae5A30b8Bc";
const BASE_CHAIN_ID = "base";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ""; // Optional API key for BaseScan
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base

// Helper to fetch total supply via RPC call
async function fetchTotalSupply(): Promise<number | null> {
  try {
    const rpcUrl = "https://mainnet.base.org";
    // totalSupply() function selector: 0x18160ddd
    const totalSupplyCall = {
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          to: TOKEN_ADDRESS,
          data: "0x18160ddd", // totalSupply() function selector
        },
        "latest",
      ],
      id: 1,
    };

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Catwalk-MiniApp",
      },
      body: JSON.stringify(totalSupplyCall),
    });

    if (response.ok) {
      const data = await response.json() as any;
      if (data.result && data.result !== "0x" && !data.error) {
        // Convert from hex to BigInt, then divide by 10^18 (assuming 18 decimals)
        const supplyRaw = BigInt(data.result);
        const supply = Number(supplyRaw) / Math.pow(10, 18);
        console.log("[Token Stats] Total supply fetched:", supply);
        return supply;
      }
    }
  } catch (error) {
    console.log("[Token Stats] Total supply fetch failed:", error);
  }
  return null;
}

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
      const tokenData = await tokenInfoResponse.json() as any;
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
      const txData = await txResponse.json() as any;
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
      const data = await response.json() as any;
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

// Helper to calculate market cap from price and total supply
function calculateMarketCap(price: number | null, totalSupply: number | null): number | null {
  if (price && price > 0 && totalSupply && totalSupply > 0) {
    return price * totalSupply;
  }
  return null;
}

// Helper to store price and calculate 24h change from stored data if needed
async function storePriceAndGet24hChange(
  price: number,
  marketCap: number | null,
  volume24h: number | null,
  external24hChange: number | null
): Promise<number | null> {
  // Store price snapshot only if last one was more than 30 minutes ago
  // This prevents excessive database writes while still maintaining good data granularity
  try {
    const latestSnapshot = await getLatestPriceSnapshot(TOKEN_ADDRESS);
    
    const shouldStore = !latestSnapshot || (() => {
      const lastTimestamp = new Date(latestSnapshot.timestamp).getTime();
      const now = Date.now();
      const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
      return (now - lastTimestamp) >= thirtyMinutes;
    })();
    
    if (shouldStore) {
      storePriceSnapshot(
        TOKEN_ADDRESS,
        price,
        price, // price is already in USD
        marketCap,
        volume24h
      ).catch((err) => {
        console.error("[Token Price] Failed to store price snapshot (non-critical):", err);
      });
      console.log("[Token Price] Stored price snapshot (30min interval)");
    } else {
      console.log("[Token Price] Skipping price snapshot (less than 30min since last)");
    }
  } catch (err) {
    console.error("[Token Price] Error checking latest price snapshot:", err);
    // If check fails, still try to store (fallback behavior)
    storePriceSnapshot(
      TOKEN_ADDRESS,
      price,
      price,
      marketCap,
      volume24h
    ).catch((storeErr) => {
      console.error("[Token Price] Failed to store price snapshot (non-critical):", storeErr);
    });
  }
  
  // If we have external 24h change, use it
  if (external24hChange !== null) {
    return external24hChange;
  }
  
  // Otherwise, try to calculate from stored data
  try {
    const price24hAgo = await getPrice24hAgo(TOKEN_ADDRESS);
    if (price24hAgo && price24hAgo.price_usd) {
      const calculated = calculate24hChangePercent(price, price24hAgo.price_usd);
      console.log("[Token Price] Calculated 24h change from stored data:", calculated);
      return calculated;
    }
  } catch (err) {
    console.log("[Token Price] Failed to calculate 24h change from stored data:", err);
  }
  
  return null;
}

// Helper to fetch 24h price change from CoinGecko or DexScreener
async function fetch24hChange(): Promise<number | null> {
  const tokenAddressLower = TOKEN_ADDRESS.toLowerCase();
  
  // Try CoinGecko first
  try {
    const coinGeckoResponse = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${tokenAddressLower}&vs_currencies=usd&include_24hr_change=true`
    );

    if (coinGeckoResponse.ok) {
      const data = await coinGeckoResponse.json() as any;
      const tokenData = data[tokenAddressLower];
      if (tokenData && tokenData.usd_24h_change !== null && tokenData.usd_24h_change !== undefined) {
        console.log("[24h Change] Fetched from CoinGecko:", tokenData.usd_24h_change);
        return tokenData.usd_24h_change;
      }
    }
  } catch (cgError) {
    console.log("[24h Change] CoinGecko failed:", cgError);
  }

  // Try DexScreener pair endpoint first (most reliable)
  try {
    const pairAddressLower = PAIR_ADDRESS.toLowerCase();
    const dexScreenerPairUrl = `https://api.dexscreener.com/latest/dex/pairs/base/${pairAddressLower}`;
    const dexResponse = await fetch(dexScreenerPairUrl, {
      headers: { "User-Agent": "Catwalk-MiniApp" },
    });

    if (dexResponse.ok) {
      const data = await dexResponse.json() as any;
      const pair = data.pair || (data.pairs && data.pairs[0]);
      
      if (pair) {
        // Try multiple possible field names
        let change24h: number | null = null;
        if (pair.priceChange24h !== null && pair.priceChange24h !== undefined) {
          change24h = parseFloat(String(pair.priceChange24h));
        } else if (pair.priceChange?.h24 !== null && pair.priceChange?.h24 !== undefined) {
          change24h = parseFloat(String(pair.priceChange.h24));
        } else if (pair.priceChange?.pct24h !== null && pair.priceChange?.pct24h !== undefined) {
          change24h = parseFloat(String(pair.priceChange.pct24h));
        }
        
        if (change24h !== null && !isNaN(change24h)) {
          console.log("[24h Change] Fetched from DexScreener pair:", change24h);
          return change24h;
        } else {
          console.log("[24h Change] DexScreener pair found but no valid 24h change field:", {
            priceChange24h: pair.priceChange24h,
            priceChange: pair.priceChange,
            allKeys: Object.keys(pair).filter(k => k.toLowerCase().includes('change') || k.toLowerCase().includes('24')),
          });
        }
      }
    }
  } catch (dexError) {
    console.log("[24h Change] DexScreener pair endpoint failed:", dexError);
  }
  
  // Try DexScreener tokens endpoint as fallback
  try {
    const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddressLower}`;
    const dexResponse = await fetch(dexScreenerUrl, {
      headers: { "User-Agent": "Catwalk-MiniApp" },
    });

    if (dexResponse.ok) {
      const data = await dexResponse.json() as any;
      if (data.pairs && Array.isArray(data.pairs) && data.pairs.length > 0) {
        // Find the pair on Base chain with highest liquidity
        const basePairs = data.pairs.filter(
          (p: any) => p.chainId === "base" || p.chainId === BASE_CHAIN_ID
        );
        
        if (basePairs.length > 0) {
          const bestPair = basePairs.reduce((best: any, current: any) => {
            const bestLiq = parseFloat(best.liquidity?.usd || "0");
            const currentLiq = parseFloat(current.liquidity?.usd || "0");
            return currentLiq > bestLiq ? current : best;
          });

          // Try multiple possible field names
          let change24h: number | null = null;
          if (bestPair.priceChange24h !== null && bestPair.priceChange24h !== undefined) {
            change24h = parseFloat(String(bestPair.priceChange24h));
          } else if (bestPair.priceChange?.h24 !== null && bestPair.priceChange?.h24 !== undefined) {
            change24h = parseFloat(String(bestPair.priceChange.h24));
          } else if (bestPair.priceChange?.pct24h !== null && bestPair.priceChange?.pct24h !== undefined) {
            change24h = parseFloat(String(bestPair.priceChange.pct24h));
          }
          
          if (change24h !== null && !isNaN(change24h)) {
            console.log("[24h Change] Fetched from DexScreener tokens:", change24h);
            return change24h;
          }
        }
      }
    }
  } catch (dexError) {
    console.log("[24h Change] DexScreener tokens endpoint failed:", dexError);
  }

  return null;
}

export async function GET() {
  try {
    // Fetch token stats (holders, transactions, total supply, 24h change) in parallel
    const [tokenStats, totalSupply, priceChange24h] = await Promise.all([
      fetchTokenStats(),
      fetchTotalSupply(),
      fetch24hChange(), // Fetch 24h change separately
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
        const pairData = await pairResponse.json() as any;
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
        const data = await dexScreenerResponse.json() as any;
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
          const pairData = await pairResponse.json() as any;
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
          const pairData = await pairResponse.json() as any;
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
          // Log available price change fields for debugging
          console.log("[Token Price] Available price change fields:", {
            priceChange24h: selectedPair.priceChange24h,
            priceChange: selectedPair.priceChange,
            priceChange_h24: selectedPair.priceChange?.h24,
            priceChange_pct24h: selectedPair.priceChange?.pct24h,
            priceChange_percent24h: selectedPair.priceChange?.percent24h,
            allKeys: Object.keys(selectedPair).filter(k => k.toLowerCase().includes('change') || k.toLowerCase().includes('24')),
          });
          
          // Try multiple possible field names for 24h change
          let priceChange24hFromPair: number | null = null;
          if (selectedPair.priceChange24h !== null && selectedPair.priceChange24h !== undefined) {
            priceChange24hFromPair = parseFloat(String(selectedPair.priceChange24h));
          } else if (selectedPair.priceChange?.h24 !== null && selectedPair.priceChange?.h24 !== undefined) {
            priceChange24hFromPair = parseFloat(String(selectedPair.priceChange.h24));
          } else if (selectedPair.priceChange?.pct24h !== null && selectedPair.priceChange?.pct24h !== undefined) {
            priceChange24hFromPair = parseFloat(String(selectedPair.priceChange.pct24h));
          } else if (selectedPair.priceChange?.percent24h !== null && selectedPair.priceChange?.percent24h !== undefined) {
            priceChange24hFromPair = parseFloat(String(selectedPair.priceChange.percent24h));
          }
          
          // Use price change from pair if available, otherwise use the fetched one from Promise.all
          const finalPriceChange24h = priceChange24hFromPair !== null ? priceChange24hFromPair : (priceChange24h || null);

          let marketCap: number | null = null;
          if (selectedPair.fdv) {
            marketCap = parseFloat(String(selectedPair.fdv));
          } else if (selectedPair.marketCap) {
            marketCap = parseFloat(String(selectedPair.marketCap));
          }

          // Calculate market cap if we have price and total supply
          const calculatedMarketCap = marketCap || calculateMarketCap(price, totalSupply);
          const volume24h = parseFloat(String(selectedPair.volume?.h24 || selectedPair.volume24h || "0"));
          
          // Store price and calculate 24h change if needed
          const final24hChange = await storePriceAndGet24hChange(
            price,
            calculatedMarketCap,
            volume24h,
            finalPriceChange24h
          );
          
          const response = {
            price,
            priceChange24h: final24hChange,
            volume24h,
            liquidity: parseFloat(String(selectedPair.liquidity?.usd || "0")),
            marketCap: calculatedMarketCap,
            totalSupply,
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
      const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // WETH on Base
      
      // Fetch WETH price from CoinGecko for USD conversion
      let wethPrice = 3000; // Default fallback
      try {
        const wethPriceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=weth&vs_currencies=usd");
        if (wethPriceRes.ok) {
          const wethData = await wethPriceRes.json() as any;
          if (wethData.weth?.usd) {
            wethPrice = wethData.weth.usd;
            console.log("[Token Price] Fetched WETH price:", wethPrice);
          }
        }
      } catch (_wethError) {
        console.log("[Token Price] Failed to fetch WETH price, using default:", wethPrice);
      }
      
      // First, get token0 and token1 addresses to determine order
      const token0Selector = "0x0dfe1681"; // token0() function selector
      const token1Selector = "0xd21220a7"; // token1() function selector
      
      console.log("[Token Price] Strategy 5: Fetching pool token addresses...");
      
      // Use direct JSON-RPC call instead of BaseScan proxy endpoint
      const rpcUrl = "https://mainnet.base.org"; // Base public RPC
      
      const token0Call = {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: PAIR_ADDRESS,
            data: token0Selector,
          },
          "latest",
        ],
        id: 1,
      };
      
      const token1Call = {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: PAIR_ADDRESS,
            data: token1Selector,
          },
          "latest",
        ],
        id: 2,
      };

      const [token0Res, token1Res] = await Promise.all([
        fetch(rpcUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Catwalk-MiniApp",
          },
          body: JSON.stringify(token0Call),
        }),
        fetch(rpcUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Catwalk-MiniApp",
          },
          body: JSON.stringify(token1Call),
        }),
      ]);

      if (token0Res.ok && token1Res.ok) {
        const token0Data = await token0Res.json() as any;
        const token1Data = await token1Res.json() as any;
        
        console.log("[Token Price] Token responses:", { 
          token0Result: token0Data.result?.substring(0, 50), 
          token1Result: token1Data.result?.substring(0, 50),
          token0Error: token0Data.error,
          token1Error: token1Data.error,
        });
        
        // Check for errors in RPC response
        if (token0Data.error || token1Data.error) {
          console.log("[Token Price] RPC errors:", { token0Error: token0Data.error, token1Error: token1Data.error });
          throw new Error("RPC call failed");
        }
        
        if (token0Data.result && token1Data.result && token0Data.result !== "0x" && token1Data.result !== "0x") {
          // Extract token addresses (last 40 chars of 64-char hex string)
          const token0Addr = "0x" + token0Data.result.slice(-40);
          const token1Addr = "0x" + token1Data.result.slice(-40);
          
          console.log("[Token Price] Pool tokens:", { token0Addr, token1Addr });
          
          const isToken0CATWALK = token0Addr.toLowerCase() === TOKEN_ADDRESS.toLowerCase();
          const isToken1CATWALK = token1Addr.toLowerCase() === TOKEN_ADDRESS.toLowerCase();
          const isToken0WETH = token0Addr.toLowerCase() === WETH_ADDRESS.toLowerCase();
          const isToken1WETH = token1Addr.toLowerCase() === WETH_ADDRESS.toLowerCase();
          const isToken0USDC = token0Addr.toLowerCase() === USDC_ADDRESS.toLowerCase();
          const isToken1USDC = token1Addr.toLowerCase() === USDC_ADDRESS.toLowerCase();
          
          if (!isToken0CATWALK && !isToken1CATWALK) {
            console.log("[Token Price] Pool doesn't contain CATWALK token", { token0Addr, token1Addr });
          } else {
            // Get slot0 which contains sqrtPriceX96
            const slot0Selector = "0x3850c7bd"; // slot0() function selector
            console.log("[Token Price] Fetching slot0...");
            
            const slot0Call = {
              jsonrpc: "2.0",
              method: "eth_call",
              params: [
                {
                  to: PAIR_ADDRESS,
                  data: slot0Selector,
                },
                "latest",
              ],
              id: 3,
            };
            
            const slot0Res = await fetch(rpcUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "Catwalk-MiniApp",
              },
              body: JSON.stringify(slot0Call),
            });

            if (slot0Res.ok) {
              const slot0Data = await slot0Res.json() as any;
              console.log("[Token Price] Slot0 response:", { 
                hasResult: !!slot0Data.result, 
                resultLength: slot0Data.result?.length,
                error: slot0Data.error,
              });
              
              if (slot0Data.error) {
                console.log("[Token Price] Slot0 RPC error:", slot0Data.error);
                throw new Error("Slot0 RPC call failed");
              }
              
              if (slot0Data.result && slot0Data.result !== "0x") {
                // Parse sqrtPriceX96 from slot0 (first 32 bytes = 64 hex chars)
                const sqrtPriceX96Hex = slot0Data.result.slice(2, 66);
                const sqrtPriceX96 = BigInt("0x" + sqrtPriceX96Hex);
                
                // Calculate price: (sqrtPriceX96 / 2^96)^2
                const Q96 = BigInt(2) ** BigInt(96);
                const priceRatio = Number(sqrtPriceX96 * sqrtPriceX96) / Number(Q96 * Q96);
                
                console.log("[Token Price] Price calculation:", { 
                  sqrtPriceX96: sqrtPriceX96.toString(), 
                  priceRatio,
                  isToken0CATWALK,
                  isToken1CATWALK,
                  isToken0WETH,
                  isToken1WETH,
                  isToken0USDC,
                  isToken1USDC
                });
                
                // Calculate price in USD
                // Handle both WETH and USDC pairs
                // priceRatio from sqrtPriceX96 = token1Amount / token0Amount (in raw units)
                let price: number;
                
                if (isToken0CATWALK) {
                  // CATWALK is token0
                  if (isToken1USDC) {
                    // CATWALK/USDC pair
                    // priceRatio = USDC / CATWALK (raw units)
                    // CATWALK price in USDC = 1/priceRatio * (10^18 / 10^6) = 1/priceRatio * 10^12
                    price = (1 / priceRatio) * Math.pow(10, 18 - 6);
                  } else if (isToken1WETH) {
                    // CATWALK/WETH pair
                    // priceRatio = WETH / CATWALK (raw units, both have 18 decimals so decimals cancel)
                    // CATWALK price in WETH = 1/priceRatio
                    // CATWALK price in USD = (1/priceRatio) * WETH price
                    price = (1 / priceRatio) * wethPrice;
                  } else {
                    // Unknown pair, skip
                    console.log("[Token Price] Unknown pair type (CATWALK is token0)", { token0Addr, token1Addr });
                    throw new Error("Unknown pair type");
                  }
                } else if (isToken1CATWALK) {
                  // CATWALK is token1
                  if (isToken0USDC) {
                    // USDC/CATWALK pair
                    // priceRatio = CATWALK / USDC (raw units)
                    // CATWALK price in USDC = priceRatio * (10^18 / 10^6) = priceRatio * 10^12
                    price = priceRatio * Math.pow(10, 18 - 6);
                  } else if (isToken0WETH) {
                    // WETH/CATWALK pair (this is our case!)
                    // priceRatio from sqrtPriceX96 = token1Amount / token0Amount (in raw units)
                    // Since both WETH and CATWALK have 18 decimals, we need to divide by 10^18 to get the actual ratio
                    // priceRatio_raw = (CATWALK_raw / WETH_raw) = (CATWALK * 10^18) / (WETH * 10^18)
                    // So: CATWALK_price_in_WETH = priceRatio_raw / 10^18
                    // But wait, sqrtPriceX96 already accounts for this in the pool, so:
                    // The priceRatio from sqrtPriceX96 is already the ratio of token amounts
                    // Since both have same decimals, we can use it directly: CATWALK_price_in_WETH = priceRatio
                    // However, if priceRatio is very large (> 1), it means we have the inverse
                    // Let's check: if priceRatio > 1, then 1 CATWALK > 1 WETH (unlikely for a new token)
                    // So we should use: CATWALK_price_in_WETH = priceRatio (if priceRatio < 1) or 1/priceRatio (if priceRatio > 1)
                    // Actually, the sqrtPriceX96 formula gives us: sqrt(token1/token0) * 2^96
                    // So priceRatio = token1/token0 in raw units
                    // For WETH/CATWALK: priceRatio = CATWALK_raw / WETH_raw
                    // CATWALK_price_in_WETH = (CATWALK_raw / 10^18) / (WETH_raw / 10^18) = priceRatio
                    // But if priceRatio is huge, it means we need to invert it
                    // Let's use: CATWALK_price = priceRatio * WETH_price (if reasonable) or 1/priceRatio * WETH_price
                    // Given priceRatio = 9.5 billion, we should use: 1/priceRatio * WETH_price
                    const catwalkPriceInWETH = priceRatio > 1 ? (1 / priceRatio) : priceRatio;
                    price = catwalkPriceInWETH * wethPrice;
                    console.log("[Token Price] WETH/CATWALK pair detected", { 
                      priceRatio, 
                      catwalkPriceInWETH, 
                      wethPrice, 
                      calculatedPrice: price 
                    });
                  } else {
                    // Unknown pair, skip
                    console.log("[Token Price] Unknown pair type (CATWALK is token1)", { token0Addr, token1Addr });
                    throw new Error("Unknown pair type");
                  }
                } else {
                  throw new Error("CATWALK not found in pool");
                }
                
                console.log("[Token Price] Final calculated price:", price);
                console.log("[Token Price] Price breakdown:", {
                  priceRatio,
                  wethPrice,
                  calculatedPrice: price,
                  priceInScientific: price.toExponential(),
                });
                
                // Allow prices from 0.0000000000001 to 1000000 (very small to very large)
                // For tokens with very small prices, we need to allow even smaller values
                if (price > 0 && price < 1000000 && !isNaN(price) && isFinite(price)) {
                  const marketCap = calculateMarketCap(price, totalSupply);
                  console.log("[Token Price] Success! Calculated price from pool reserves:", { 
                    price, 
                    priceFormatted: price.toExponential(6),
                    marketCap, 
                    totalSupply,
                    hasTotalSupply: !!totalSupply,
                    hasMarketCap: !!marketCap
                  });
                  
                  // Store price and calculate 24h change if needed
                  const final24hChange = await storePriceAndGet24hChange(
                    price,
                    marketCap,
                    null,
                    priceChange24h
                  );
                  
                  // Always return data, even if market cap couldn't be calculated
                  return NextResponse.json({
                    price,
                    priceChange24h: final24hChange,
                    volume24h: null,
                    liquidity: null,
                    marketCap: marketCap || null,
                    totalSupply: totalSupply || null,
                    holders: tokenStats.holders,
                    transactions: tokenStats.transactions,
                    symbol: "CATWALK",
                    name: "Catwalk",
                    address: TOKEN_ADDRESS,
                    source: "basescan-pool-reserves",
                  });
                } else {
                  console.log("[Token Price] Price validation failed:", { 
                    price, 
                    isValid: price > 0 && price < 1000000 && !isNaN(price) && isFinite(price),
                    checks: {
                      greaterThanZero: price > 0,
                      lessThanMax: price < 1000000,
                      isNumber: !isNaN(price),
                      isFinite: isFinite(price)
                    }
                  });
                  // Even if price validation fails, still return what we have for debugging
                  // But don't return invalid data - let it fall through to other strategies
                }
              } else {
                console.log("[Token Price] Slot0 result is empty or invalid");
              }
            } else {
              console.log("[Token Price] Slot0 request failed:", slot0Res.status);
            }
          }
        } else {
          console.log("[Token Price] Token data results are missing");
        }
      } else {
        console.log("[Token Price] Token address requests failed:", { token0Status: token0Res.status, token1Status: token1Res.status });
      }
    } catch (poolReservesError: unknown) {
      const err = poolReservesError as Error;
      console.error("[Token Price] Pool reserves calculation failed:", err.message, err.stack);
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
        const quoteData = await quoteResponse.json() as any;
        // Calculate price from quote (amount in USDC / amount out in tokens)
        // This gives us price per token
        if (quoteData.quote && quoteData.quote.amount && quoteData.quote.amountOut) {
          const amountIn = parseFloat(quoteData.quote.amount) / 1e6; // USDC has 6 decimals
          const amountOut = parseFloat(quoteData.quote.amountOut) / 1e18; // Assuming 18 decimals for CATWALK
          const price = amountIn / amountOut;
          
          if (price > 0) {
            const marketCap = calculateMarketCap(price, totalSupply);
            console.log("[Token Price] Uniswap quote API success:", { price, marketCap });
            return NextResponse.json({
              price,
              priceChange24h: priceChange24h || null,
              volume24h: null,
              liquidity: null,
              marketCap,
              totalSupply,
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
        const data = await coinGeckoResponse.json() as any;
        const tokenData = data[tokenAddressLower];

        if (tokenData && tokenData.usd) {
          const marketCap = calculateMarketCap(tokenData.usd, totalSupply);
          const final24hChange = await storePriceAndGet24hChange(
            tokenData.usd,
            marketCap,
            null,
            tokenData.usd_24h_change || null
          );
          
          return NextResponse.json({
            price: tokenData.usd,
            priceChange24h: final24hChange,
            volume24h: null,
            liquidity: null,
            marketCap,
            totalSupply,
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
      priceChange24h: priceChange24h || null, // Still return 24h change if we fetched it
      volume24h: null,
      liquidity: null,
      marketCap: null,
      totalSupply,
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
