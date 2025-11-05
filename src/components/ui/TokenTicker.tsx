"use client";

import { useState, useEffect } from "react";
import { useMiniApp } from "@neynar/react";

interface RecentPurchase {
  buyerAddress: string;
  amount: string;
  username?: string;
  displayName?: string;
}

export function TokenTicker() {
  const { actions } = useMiniApp();
  const [tokenData, setTokenData] = useState<{
    price: number | null;
    priceChange24h: number | null;
    volume24h: number | null;
    marketCap: number | null;
    liquidity: number | null;
    holders: number | null;
    transactions: number | null;
    symbol: string;
    name: string;
  } | null>(null);
  const [recentPurchase, setRecentPurchase] = useState<RecentPurchase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTokenPrice = async () => {
      try {
        console.log("[TokenTicker] Fetching token data...");
        const [priceRes, purchaseRes] = await Promise.all([
          fetch("/api/token-price"),
          fetch("/api/recent-purchases"),
        ]);
        
        console.log("[TokenTicker] Price response status:", priceRes.status);
        console.log("[TokenTicker] Purchase response status:", purchaseRes.status);
        
        if (!priceRes.ok) {
          console.error("[TokenTicker] Price API error:", priceRes.status, priceRes.statusText);
        }
        
        const priceData = await priceRes.json();
        console.log("[TokenTicker] Price data received:", {
          price: priceData.price,
          priceChange24h: priceData.priceChange24h,
          volume24h: priceData.volume24h,
          marketCap: priceData.marketCap,
          error: priceData.error,
          source: priceData.source,
        });
        
        // Set token data regardless of whether we have price data
        // This allows the banner to show token info even if price isn't available
        setTokenData({
          price: priceData.price,
          priceChange24h: priceData.priceChange24h,
          volume24h: priceData.volume24h,
          marketCap: priceData.marketCap,
          liquidity: priceData.liquidity,
          holders: priceData.holders,
          transactions: priceData.transactions,
          symbol: priceData.symbol || "CATWALK",
          name: priceData.name || "Catwalk",
        });
        
        // Don't show errors to users - just log them
        // The banner will show available data gracefully
        if (priceData.error) {
          console.warn("[TokenTicker] API returned error (not showing to user):", priceData.error);
        }

        const purchaseData = await purchaseRes.json();
        console.log("[TokenTicker] Purchase data received:", purchaseData);
        if (purchaseData.ok && purchaseData.latestPurchase) {
          setRecentPurchase(purchaseData.latestPurchase);
        } else {
          console.log("[TokenTicker] No recent purchase data");
        }
      } catch (_error: unknown) {
        const err = _error as Error;
        console.error("[TokenTicker] Error fetching token data:", err);
        // Don't show errors to users - just log them
      } finally {
        setLoading(false);
      }
    };

    fetchTokenPrice();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTokenPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  // Always show the ticker, even while loading
  // Show placeholder content if data isn't available yet

  const priceChange = tokenData?.priceChange24h || 0;
  const isPositive = priceChange >= 0;

  // Format large numbers for display
  const formatCurrency = (value: number | null): string => {
    if (value === null || value === 0) return "—";
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(2)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  // Format price nicely - handle very small numbers without scientific notation
  const formatPrice = (price: number): string => {
    if (price >= 0.01) {
      return price.toFixed(6);
    } else if (price >= 0.0001) {
      return price.toFixed(8);
    } else if (price >= 0.000001) {
      return price.toFixed(10);
    } else {
      // For very small prices, show up to 12 decimal places
      return price.toFixed(12).replace(/\.?0+$/, '');
    }
  };


  // Format token amount for display
  const formatTokenAmount = (amount: string): string => {
    const num = parseFloat(amount);
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  // Create scrolling content - prioritize market cap and 24h change
  const tickerContent = [
    <span key="symbol" style={{ color: "#c1b400", fontWeight: 600 }}>
      {tokenData?.symbol || "CATWALK"}
    </span>,
    // Market cap first (most important) - show even if 0 or null for debugging
    tokenData && tokenData.marketCap !== null ? (
      <span key="marketcap" style={{ color: "#ffffff", fontWeight: 600 }}>
        MCap: {tokenData.marketCap > 0 ? formatCurrency(tokenData.marketCap) : "N/A"}
      </span>
    ) : null,
    // 24h change second (performance indicator) - always show if available
    tokenData && tokenData.priceChange24h !== null && tokenData.priceChange24h !== 0 ? (
      <span
        key="change"
        style={{
          color: isPositive ? "#00ff00" : "#ff4444",
          fontWeight: 600,
        }}
      >
        24HR: {isPositive ? "+" : ""}
        {priceChange.toFixed(2)}%
      </span>
    ) : null,
    // Loading state (only show if no data at all)
    loading && !tokenData ? (
      <span key="loading" style={{ color: "#ffffff", opacity: 0.7 }}>
        Loading...
      </span>
    ) : null,
    // Volume 24h
    tokenData && tokenData.volume24h !== null && tokenData.volume24h > 0 ? (
      <span key="volume" style={{ color: "#ffffff", opacity: 0.8 }}>
        Vol: {formatCurrency(tokenData.volume24h)}
      </span>
    ) : null,
    // Recent purchase
    recentPurchase ? (
      <span key="latest" style={{ color: "#c1b400", fontWeight: 600 }}>
        Latest: {recentPurchase.displayName || recentPurchase.username || `${recentPurchase.buyerAddress.slice(0, 6)}...${recentPurchase.buyerAddress.slice(-4)}`} bought {formatTokenAmount(recentPurchase.amount)} $CATWALK
      </span>
    ) : null,
  ].filter(Boolean);
  
  // If no content, show at least the symbol
  if (tickerContent.length === 0 || (tickerContent.length === 1 && tickerContent[0]?.key === "symbol")) {
    // If we have data but no market cap/price, show holders/transactions
    if (tokenData) {
      if (tokenData.holders) {
        tickerContent.push(
          <span key="holders" style={{ color: "#ffffff", opacity: 0.8 }}>
            {tokenData.holders.toLocaleString()} holders
          </span>
        );
      }
      if (tokenData.transactions) {
        tickerContent.push(
          <span key="txns" style={{ color: "#ffffff", opacity: 0.8 }}>
            {tokenData.transactions.toLocaleString()} txns
          </span>
        );
      }
      if (!tokenData.marketCap && !tokenData.price) {
        tickerContent.push(
          <span key="loading-data" style={{ color: "#ffffff", opacity: 0.7 }}>
            Loading market data...
          </span>
        );
      }
    }
  }

  // Create a single row of content with separators
  const tickerRow = tickerContent.map((item, idx) => (
    <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      {item}
      {idx < tickerContent.length - 1 && (
        <span style={{ color: "#c1b400", opacity: 0.5 }}>•</span>
      )}
    </span>
  ));

  // Create swap URL for Farcaster wallet
  // Using Uniswap on Base with USDC as input and CATWALK as output
  const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
  // USDC on Base (native USDC)
  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const swapUrl = `https://app.uniswap.org/swap?chain=base&inputCurrency=${USDC_ADDRESS}&outputCurrency=${TOKEN_ADDRESS}`;

  const handleTickerClick = () => {
    // Use Farcaster SDK actions to open swap in embedded wallet
    if (actions?.openUrl) {
      actions.openUrl(swapUrl);
    } else if (typeof window !== "undefined") {
      // Fallback to window.open if SDK actions not available
      window.open(swapUrl, "_blank");
    }
  };

  return (
    <div
      onClick={handleTickerClick}
      style={{
        width: "100%",
        background: "#000000",
        borderBottom: "1px solid #c1b400",
        padding: "6px 0",
        overflow: "hidden",
        position: "relative",
        fontSize: "11px",
        fontWeight: 500,
        lineHeight: "1.2",
        cursor: "pointer",
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#1a1a1a";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#000000";
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "32px",
          whiteSpace: "nowrap",
          animation: "scrollTicker 29.6s linear infinite", // 26% faster (40s * 0.74)
        }}
      >
        {/* Render multiple copies for seamless scroll */}
        {[...Array(3)].map((_, copyIdx) => (
          <div
            key={copyIdx}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "#c1b400",
            }}
          >
            {tickerRow}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes scrollTicker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
      `}</style>
    </div>
  );
}

