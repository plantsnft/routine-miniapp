"use client";

import { useState, useEffect } from "react";
import DailyCheckin from "~/app/daily-checkin";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";
import { FollowChannelButton } from "~/components/ui/FollowChannelButton";

/**
 * HomeTab component displays the main landing content for the mini app.
 * 
 * This is the default tab that users see when they first open the mini app.
 * It provides the Catwalk welcome message and check-in functionality.
 * 
 * @example
 * ```tsx
 * <HomeTab />
 * ```
 */
export function HomeTab() {
  const keywords = ["Leashes", "Backpacks", "Strollers", "Traveling", "Car Rides", "Off Leash", "+ More"];
  const [currentKeywordIndex, setCurrentKeywordIndex] = useState(0);
  const [followers, setFollowers] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [showCreatorsModal, setShowCreatorsModal] = useState(false);
  const [creators, setCreators] = useState<Array<{ fid: number; username?: string; displayName?: string }>>([]);

  const CREATOR_COUNT = CATWALK_CREATOR_FIDS.length || 29; // Default to 29 if list is empty
  const CATWALK_CHANNEL_URL = "https://farcaster.xyz/~/channel/Catwalk";

  // Cycle through keywords every 2.22 seconds (26% faster: 3000ms * 0.74)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentKeywordIndex((prev) => (prev + 1) % keywords.length);
    }, 2220); // 26% faster than 3 seconds
    return () => clearInterval(interval);
  }, [keywords.length]);

  // Fetch channel stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/channel-stats");
        const data = await res.json();
        if (data.followers !== null) {
          setFollowers(data.followers);
        }
      } catch (error) {
        console.error("Error fetching channel stats:", error);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, []);

  // Fetch creator details when modal opens
  useEffect(() => {
    if (showCreatorsModal && CATWALK_CREATOR_FIDS.length > 0) {
      const fetchCreators = async () => {
        try {
          const fidsString = CATWALK_CREATOR_FIDS.join(",");
          const res = await fetch(`/api/users?fids=${fidsString}`);
          const data = await res.json();
          if (data.users) {
            setCreators(
              data.users.map((u: any) => ({
                fid: u.fid,
                username: u.username,
                displayName: u.display_name,
              }))
            );
          } else {
            // Fallback: just show FIDs if user fetch fails
            setCreators(CATWALK_CREATOR_FIDS.map((fid) => ({ fid })));
          }
        } catch (error) {
          console.error("Error fetching creators:", error);
          // Fallback: just show FIDs
          setCreators(CATWALK_CREATOR_FIDS.map((fid) => ({ fid })));
        }
      };
      fetchCreators();
    }
  }, [showCreatorsModal]);

  return (
    <div 
      className="px-6 py-4" 
      style={{ 
        background: "transparent",
        minHeight: "100vh", 
        position: "relative" 
      }}
    >
      <div className="max-w-md mx-auto" style={{ position: "relative", zIndex: 1 }}>

        {/* Featured Photo - Add your photo here */}
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <img 
            src="/featured-photo.png" 
            alt="Catwalk Featured" 
            style={{ 
              maxWidth: "100%", 
              width: "100%", 
              height: "auto",
              objectFit: "contain",
              borderRadius: 12,
              border: "2px solid #c1b400",
            }}
            onError={(e) => {
              // Hide if image doesn't exist
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
        </div>

        {/* Channel Stats */}
        <div
          style={{
            marginTop: 12,
            marginBottom: 12,
            padding: "14px 16px",
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
          }}
        >
          <a
            href={CATWALK_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textAlign: "center",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            <p style={{ margin: 0, color: "#c1b400", fontSize: 12, fontWeight: 600 }}>
              /Catwalk channel fans
            </p>
            <p style={{ margin: 0, color: "#ffffff", fontSize: 20, fontWeight: 700 }}>
              {loadingStats ? "..." : followers !== null ? followers.toLocaleString() : "—"}
            </p>
          </a>
          <div
            style={{
              width: "1px",
              height: "30px",
              background: "#c1b400",
              opacity: 0.3,
            }}
          />
          <button
            onClick={() => setShowCreatorsModal(true)}
            style={{
              textAlign: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <p style={{ margin: 0, color: "#c1b400", fontSize: 12, fontWeight: 600 }}>
              Official Catwalk Creators
            </p>
            <p style={{ margin: 0, color: "#ffffff", fontSize: 20, fontWeight: 700 }}>
              {CREATOR_COUNT}
            </p>
          </button>
        </div>

        <DailyCheckin />

        {/* Channel description and cycling keywords at the bottom */}
        <div
          style={{
            marginTop: 32,
            padding: "20px 16px",
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              marginBottom: 12,
              color: "#c1b400",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            What is the{" "}
            <a
              href={CATWALK_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#c1b400",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              /Catwalk
            </a>{" "}
            channel?
          </p>
          <p
            style={{
              margin: 0,
              marginBottom: 16,
              color: "#ffffff",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            It&apos;s a Cat owners sharing content and tips of our feline family outside the home…..
          </p>
          
          {/* Cycling keywords animation - fixed double flash */}
          <div
            style={{
              minHeight: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {keywords.map((keyword, index) => (
              <div
                key={keyword}
                style={{
                  position: index === currentKeywordIndex ? "relative" : "absolute",
                  opacity: index === currentKeywordIndex ? 1 : 0,
                  color: "#c1b400",
                  fontSize: 14,
                  fontWeight: 600,
                  transition: "opacity 0.3s ease-in-out",
                  pointerEvents: index === currentKeywordIndex ? "auto" : "none",
                }}
              >
                {keyword}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Creators Modal */}
      {showCreatorsModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.8)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowCreatorsModal(false)}
        >
          <div
            style={{
              background: "#000000",
              border: "3px solid #c1b400",
              borderRadius: 16,
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: "#c1b400", fontSize: 20, fontWeight: 700 }}>
                Official Catwalk Creators
              </h3>
              <button
                onClick={() => setShowCreatorsModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#c1b400",
                  fontSize: 24,
                  cursor: "pointer",
                  fontWeight: 700,
                  padding: 0,
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
            
            {CATWALK_CREATOR_FIDS.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {creators.map((creator) => (
                  <div
                    key={creator.fid}
                    style={{
                      padding: "12px",
                      background: "#c1b400",
                      borderRadius: 8,
                      border: "1px solid #000000",
                    }}
                  >
                    <p style={{ margin: 0, color: "#000000", fontSize: 14, fontWeight: 600 }}>
                      {creator.displayName || creator.username || `FID: ${creator.fid}`}
                    </p>
                    {creator.username && (
                      <p style={{ margin: 0, marginTop: 4, color: "#000000", fontSize: 12, opacity: 0.7 }}>
                        @{creator.username} • FID: {creator.fid}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#ffffff", fontSize: 14, textAlign: "center" }}>
                Creator list will be updated soon. Check back later!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Follow Channel Button - Fixed at bottom */}
      <FollowChannelButton />
    </div>
  );
} 