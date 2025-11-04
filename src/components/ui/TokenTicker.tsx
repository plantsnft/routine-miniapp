"use client";

import { useState, useEffect } from "react";

export function TokenTicker() {
  const [tokenData, setTokenData] = useState<{
    price: number | null;
    priceChange24h: number | null;
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

  return (
    <div
      style={{
        width: "100%",
        background: "#000000",
        borderBottom: "1px solid #c1b400",
        padding: "6px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        fontWeight: 500,
        lineHeight: "1.2",
      }}
    >
      <a
        href="https://basescan.org/token/0xa5eb1cad0dfc1c4f8d4f84f995aeda9a7a047b07"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          textDecoration: "none",
          color: "#c1b400",
          cursor: "pointer",
        }}
      >
        <span style={{ color: "#c1b400", fontWeight: 600 }}>
          {tokenData?.symbol || "CATWALK"}
        </span>
        {tokenData && tokenData.price !== null && (
          <>
            <span style={{ color: "#ffffff" }}>
              ${tokenData.price.toFixed(6)}
            </span>
            {tokenData.priceChange24h !== null && (
              <span
                style={{
                  color: isPositive ? "#00ff00" : "#ff4444",
                  fontWeight: 600,
                }}
              >
                {isPositive ? "+" : ""}
                {priceChange.toFixed(2)}%
              </span>
            )}
          </>
        )}
      </a>
    </div>
  );
}

