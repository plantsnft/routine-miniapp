"use client";

import { useState, useEffect } from "react";

export function TokenTicker() {
  const [tokenData, setTokenData] = useState<{
    price: number | null;
    priceChange24h: number | null;
    liquidity: number | null;
    holders: number | null;
    transactions: number | null;
    symbol: string;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTokenPrice = async () => {
      try {
        const res = await fetch("/api/token-price");
        const data = await res.json();
        setTokenData({
          price: data.price,
          priceChange24h: data.priceChange24h,
          liquidity: data.liquidity,
          holders: data.holders,
          transactions: data.transactions,
          symbol: data.symbol || "CATWALK",
          name: data.name || "Catwalk",
        });
      } catch (error) {
        console.error("Error fetching token price:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTokenPrice();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTokenPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !tokenData) {
    return null; // Don't show anything while loading initially
  }

  const priceChange = tokenData?.priceChange24h || 0;
  const isPositive = priceChange >= 0;

  // Format liquidity for display
  const formatLiquidity = (liq: number | null): string => {
    if (liq === null || liq === 0) return "—";
    if (liq >= 1000000) return `$${(liq / 1000000).toFixed(2)}M`;
    if (liq >= 1000) return `$${(liq / 1000).toFixed(2)}K`;
    return `$${liq.toFixed(2)}`;
  };

  // Format number for display (holders, transactions)
  const formatNumber = (num: number | null): string => {
    if (num === null || num === 0) return "—";
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // Create scrolling content
  const tickerContent = [
    <span key="symbol" style={{ color: "#c1b400", fontWeight: 600 }}>
      {tokenData?.symbol || "CATWALK"}
    </span>,
    tokenData && tokenData.price !== null ? (
      <span key="price" style={{ color: "#ffffff" }}>
        ${tokenData.price.toFixed(6)}
      </span>
    ) : null,
    tokenData && tokenData.priceChange24h !== null ? (
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
    tokenData && tokenData.liquidity !== null ? (
      <span key="liquidity" style={{ color: "#ffffff" }}>
        Liq: {formatLiquidity(tokenData.liquidity)}
      </span>
    ) : null,
    tokenData && tokenData.holders !== null ? (
      <span key="holders" style={{ color: "#ffffff" }}>
        Holders: {formatNumber(tokenData.holders)}
      </span>
    ) : null,
    tokenData && tokenData.transactions !== null ? (
      <span key="transactions" style={{ color: "#ffffff" }}>
        TXs: {formatNumber(tokenData.transactions)}
      </span>
    ) : null,
  ].filter(Boolean);

  // Create a single row of content with separators
  const tickerRow = tickerContent.map((item, idx) => (
    <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      {item}
      {idx < tickerContent.length - 1 && (
        <span style={{ color: "#c1b400", opacity: 0.5 }}>•</span>
      )}
    </span>
  ));

  return (
    <div
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
          <a
            key={copyIdx}
            href="https://basescan.org/token/0xa5eb1cad0dfc1c4f8d4f84f995aeda9a7a047b07"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
              color: "#c1b400",
              cursor: "pointer",
            }}
          >
            {tickerRow}
          </a>
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

