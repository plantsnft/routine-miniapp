"use client";

import { useState, useEffect } from "react";

interface RecentPurchase {
  buyerAddress: string;
  amount: string;
  username?: string;
  displayName?: string;
}

export function TokenTicker() {
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
  const [error, setError] = useState<string | null>(null);

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
        
        // Check if we got actual data or just error/null values
        if (priceData.error || (priceData.price === null && priceData.priceChange24h === null)) {
          const errorMsg = priceData.error || "All fields are null - API may not have token data";
          console.warn("[TokenTicker] API returned error or no data:", errorMsg);
          setError(errorMsg);
        } else {
          setError(null);
        }
        
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

        const purchaseData = await purchaseRes.json();
        console.log("[TokenTicker] Purchase data received:", purchaseData);
        if (purchaseData.ok && purchaseData.latestPurchase) {
          setRecentPurchase(purchaseData.latestPurchase);
        } else {
          console.log("[TokenTicker] No recent purchase data");
        }
      } catch (_error: any) {
        console.error("[TokenTicker] Error fetching token data:", _error);
        setError(_error?.message || "Network error");
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


  // Format token amount for display
  const formatTokenAmount = (amount: string): string => {
    const num = parseFloat(amount);
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  // Create scrolling content - always show something
  const tickerContent = [
    <span key="symbol" style={{ color: "#c1b400", fontWeight: 600 }}>
      {tokenData?.symbol || "CATWALK"}
    </span>,
    loading && !tokenData ? (
      <span key="loading" style={{ color: "#ffffff", opacity: 0.7 }}>
        Loading...
      </span>
    ) : tokenData && tokenData.price !== null && tokenData.price > 0 ? (
      <span key="price" style={{ color: "#ffffff" }}>
        ${tokenData.price.toFixed(6)}
      </span>
    ) : !loading && tokenData ? (
      <span key="no-price" style={{ color: "#ffffff", opacity: 0.7 }}>
        Price: N/A
      </span>
    ) : null,
    tokenData && tokenData.priceChange24h !== null && tokenData.priceChange24h !== 0 ? (
      <span
        key="change"
        style={{
          color: isPositive ? "#00ff00" : "#ff4444",
          fontWeight: 600,
        }}
      >
        {isPositive ? "+" : ""}
        {priceChange.toFixed(2)}%
      </span>
    ) : null,
    tokenData && tokenData.marketCap !== null && tokenData.marketCap > 0 ? (
      <span key="marketcap" style={{ color: "#ffffff" }}>
        MCap: {formatCurrency(tokenData.marketCap)}
      </span>
    ) : null,
    tokenData && tokenData.volume24h !== null && tokenData.volume24h > 0 ? (
      <span key="volume" style={{ color: "#ffffff" }}>
        Vol 24h: {formatCurrency(tokenData.volume24h)}
      </span>
    ) : null,
    recentPurchase ? (
      <span key="latest" style={{ color: "#c1b400", fontWeight: 600 }}>
        Latest: {recentPurchase.displayName || recentPurchase.username || `${recentPurchase.buyerAddress.slice(0, 6)}...${recentPurchase.buyerAddress.slice(-4)}`} bought {formatTokenAmount(recentPurchase.amount)} $CATWALK
      </span>
    ) : null,
  ].filter(Boolean);
  
  // If no content, show at least the symbol
  if (tickerContent.length === 0) {
    tickerContent.push(
      <span key="symbol" style={{ color: "#c1b400", fontWeight: 600 }}>
        CATWALK
      </span>
    );
  }
  
  // Add error indicator if there's an error
  if (error && !loading) {
    tickerContent.push(
      <span key="error" style={{ color: "#ff4444", fontSize: "10px", opacity: 0.8 }}>
        (API Error: {error.substring(0, 20)}...)
      </span>
    );
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
  // Using Uniswap on Base as it's the most common DEX
  const TOKEN_ADDRESS = "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
  const swapUrl = `https://app.uniswap.org/swap?chain=base&outputCurrency=${TOKEN_ADDRESS}`;

  const handleTickerClick = () => {
    // Try to open in Farcaster wallet if available, otherwise open in browser
    if (typeof window !== "undefined") {
      // Check if we're in a Farcaster context
      const isFarcaster = (window as any).farcaster;
      if (isFarcaster) {
        // Try to use Farcaster's native wallet if available
        window.open(swapUrl, "_blank");
      } else {
        window.open(swapUrl, "_blank");
      }
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
          animation: "scrollTicker 40s linear infinite",
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

