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
            height: "90px", // 3x bigger: 30px * 3 = 90px
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
              animation: "ticker 20s linear infinite",
              fontFamily: "cursive, 'Brush Script MT', 'Lucida Handwriting', serif",
              fontSize: "33px", // 3x bigger: 11px * 3 = 33px
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
        <div style={{ marginTop: "100px", padding: "0 8px" }}> {/* Increased to accommodate bigger ticker */}
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
                fontSize: 7.5, // Half size: 15px / 2 = 7.5px
                lineHeight: 1.7,
                margin: 0,
                textAlign: "left",
              }}
            >
              • Catwalk Entertainment Co is a collective of creators bringing their outdoor cat adventures to the blockchain
            </p>

            <p
              style={{
                color: "#ffffff",
                fontSize: 7.5, // Half size: 15px / 2 = 7.5px
                lineHeight: 1.7,
                margin: 0,
                textAlign: "left",
              }}
            >
              • Each moment — from park strolls to city walks — becomes part of an on-chain story celebrating cats and their humans.
            </p>

            <p
              style={{
                color: "#ffffff",
                fontSize: 7.5, // Half size: 15px / 2 = 7.5px
                lineHeight: 1.7,
                margin: 0,
                textAlign: "left",
              }}
            >
              • The $CATWALK token powers the ecosystem — rewarding creators, fueling partnerships, and building the future of feline-forward entertainment on Farcaster.
            </p>
          </div>

          {/* Welcome to Catwalk Button */}
          <button
            onClick={handleWelcomeClick}
            style={{
              width: "100%",
              padding: "16px 24px",
              background: "#c1b400",
              color: "#000000",
              border: "2px solid #000000",
              borderRadius: 12,
              fontSize: 24,
              fontWeight: 900,
              cursor: "pointer",
              transition: "all 0.2s",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#d4c700";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#c1b400";
            }}
          >
            Welcome to Catwalk
          </button>
        </div>
      </div>
    </div>
  );
}

