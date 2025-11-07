"use client";

import { useEffect, useState } from "react";
import { useMiniApp } from "@neynar/react";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";

interface WelcomePopupProps {
  onClose?: () => void;
}

/**
 * WelcomePopup component shows a welcome message for non-creator visitors.
 */
export function WelcomePopup({ onClose }: WelcomePopupProps) {
  const { context } = useMiniApp();
  const [showPopup, setShowPopup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAndShowWelcome = () => {
      const userFid = context?.user?.fid;
      
      // Check if user is logged in
      if (!userFid) {
        // If not logged in, show welcome popup
        const welcomeKey = "catwalk_welcome_popup";
        const hasSeenWelcome = sessionStorage.getItem(welcomeKey);
        
        if (!hasSeenWelcome) {
          sessionStorage.setItem(welcomeKey, "true");
          setShowPopup(true);
        }
        setLoading(false);
        return;
      }

      // If user is logged in, check if they're a creator
      if (CATWALK_CREATOR_FIDS.length > 0 && CATWALK_CREATOR_FIDS.includes(userFid)) {
        // Creator - don't show welcome popup (they get creator greeting instead)
        setLoading(false);
        return;
      }

      // Non-creator logged in user - show welcome popup
      const welcomeKey = `catwalk_welcome_popup_${userFid}`;
      const hasSeenWelcome = sessionStorage.getItem(welcomeKey);
      
      if (!hasSeenWelcome) {
        sessionStorage.setItem(welcomeKey, "true");
        setShowPopup(true);
      }
      setLoading(false);
    };

    // Only check if context is available
    if (context !== undefined) {
      checkAndShowWelcome();
    } else {
      setLoading(false);
    }
  }, [context]);

  const handleClose = () => {
    setShowPopup(false);
    if (onClose) {
      onClose();
    }
  };

  const handleWelcomeClick = () => {
    handleClose();
  };

  // Don't render anything if loading or not showing
  if (loading || !showPopup) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.85)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "#000000",
          border: "3px solid #c1b400",
          borderRadius: 20,
          padding: "32px 24px",
          width: "70%",
          maxWidth: "500px",
          maxHeight: "80vh",
          textAlign: "center",
          boxShadow: "0 8px 32px rgba(193, 180, 0, 0.3)",
          position: "relative",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ticker at top - "World's First Entertainment Brand Coin" */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "45px", // Half the size: 90px / 2 = 45px
            overflow: "hidden",
            borderBottom: "1px solid rgba(193, 180, 0, 0.3)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            className="ticker-text"
            style={{
              display: "inline-block",
              whiteSpace: "nowrap",
              animation: "ticker 15s linear infinite", // Faster: 20s -> 15s
              fontFamily: "cursive, 'Brush Script MT', 'Lucida Handwriting', serif",
              fontSize: "16.5px", // Half the size: 33px / 2 = 16.5px
              fontWeight: 900, // Maximum boldness (CSS max is 900, which is bolder than 700)
              color: "#c1b400",
              opacity: 0.8,
              paddingLeft: "100%",
            }}
          >
            World&apos;s First Entertainment Brand Coin • World&apos;s First Entertainment Brand Coin • World&apos;s First Entertainment Brand Coin • World&apos;s First Entertainment Brand Coin • World&apos;s First Entertainment Brand Coin • 
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "transparent",
            border: "none",
            color: "#c1b400",
            fontSize: 24,
            cursor: "pointer",
            fontWeight: 700,
            padding: 0,
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            zIndex: 10,
          }}
        >
          ×
        </button>

        {/* Content */}
        <div style={{ marginTop: "55px", padding: "0 8px" }}> {/* Adjusted for smaller ticker: 45px + 10px padding */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              marginBottom: 32,
            }}
          >
            <p
              style={{
                color: "#ffffff",
                fontSize: 15, // Twice as big: 7.5px * 2 = 15px
                lineHeight: 1.7,
                margin: 0,
                textAlign: "left",
              }}
            >
              <strong style={{ color: "#c1b400", fontWeight: 700, whiteSpace: "nowrap" }}>Catwalk Entertainment Co</strong>: putting cat adventures on-chain.
            </p>

            <p
              style={{
                color: "#ffffff",
                fontSize: 15, // Twice as big: 7.5px * 2 = 15px
                lineHeight: 1.7,
                margin: 0,
                textAlign: "left",
              }}
            >
              Every moment—parks to city—becomes an on-chain story of cats + humans.
            </p>

            <p
              style={{
                color: "#ffffff",
                fontSize: 15, // Twice as big: 7.5px * 2 = 15px
                lineHeight: 1.7,
                margin: 0,
                textAlign: "left",
              }}
            >
              <a
                href="https://app.uniswap.org/swap?chain=base&outputCurrency=0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#c1b400",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = "underline";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = "none";
                }}
              >
                <strong>$CATWALK</strong>
              </a>{" "}
              powers it—rewards creators, fuels partners, builds cat-first entertainment on Farcaster.
            </p>
          </div>

          {/* Welcome to Catwalk Button */}
          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <button
              onClick={handleWelcomeClick}
              style={{
                width: "100%",
                padding: "10px 20px", // Reduced from 16px 24px
                background: "#000000",
                color: "#c1b400",
                border: "2px solid #c1b400",
                borderRadius: 12,
                fontSize: 18, // Reduced from 24px
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
                textTransform: "uppercase",
                letterSpacing: "1px",
                textAlign: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1a1a1a";
                e.currentTarget.style.borderColor = "#d4c700";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#000000";
                e.currentTarget.style.borderColor = "#c1b400";
              }}
            >
              Welcome to Catwalk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

