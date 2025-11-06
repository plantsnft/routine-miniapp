"use client";

import { useState, useEffect } from "react";
import { useMiniApp } from "@neynar/react";
import { VideoPlayer } from "~/components/ui/VideoPlayer";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";

interface Cast {
  hash: string;
  text: string;
  author: {
    fid: number;
    username: string;
    displayName: string;
    pfp?: string;
  };
  timestamp: string;
  images: string[];
  hasVideo?: boolean;
  videoUrl?: string | null;
  likes: number;
  recasts: number;
  replies: number;
  url: string;
}

const CATWALK_CHANNEL_URL = "https://farcaster.xyz/~/channel/Catwalk";

export function FeedTab() {
  const { context, actions } = useMiniApp();
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | { message: string; debug?: any } | null>(null);
  const [_isFollowingChannel, setIsFollowingChannel] = useState<boolean>(false);
  const [showCreatorsModal, setShowCreatorsModal] = useState(false);
  const [creators, setCreators] = useState<Array<{ fid: number; username?: string; displayName?: string; castCount?: number; pfp_url?: string }>>([]);
  const [loadingCastCounts, setLoadingCastCounts] = useState(false);

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        setLoading(true);
        // Include viewer FID if available to check following status
        const viewerFid = context?.user?.fid;
        const url = viewerFid ? `/api/channel-feed?viewerFid=${viewerFid}` : "/api/channel-feed";
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) {
          // Include debug info if available
          setError(data.debug ? { message: data.error, debug: data.debug } : data.error);
          console.error("[FeedTab] API error:", data);
        } else {
          setCasts(data.casts || []);
          setIsFollowingChannel(data.isFollowingChannel || false);
          setError(null);
        }
      } catch (err) {
        console.error("Error fetching feed:", err);
        setError("Failed to load feed");
      } finally {
        setLoading(false);
      }
    };

    fetchFeed();
  }, [context?.user?.fid]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div
        style={{
          background: "transparent",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          color: "#ffffff",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid #c1b400",
              borderTop: "3px solid transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: "#c1b400", fontSize: 14 }}>Loading feed...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: "transparent",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          padding: "20px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            padding: "24px",
          }}
        >
          <p style={{ color: "#c1b400", fontSize: 16, marginBottom: 12 }}>
            Unable to load feed
          </p>
          <p style={{ color: "#ffffff", fontSize: 14, opacity: 0.7, marginBottom: 8 }}>
            {typeof error === 'object' ? error.message : error}
          </p>
          {/* Show debug info if available */}
          {typeof error === 'object' && (error as any).debug && (
            <details style={{ color: "#ffffff", fontSize: 12, opacity: 0.6, marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: "#c1b400", marginBottom: 8 }}>
                Debug Info (click to expand)
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 10 }}>
                {JSON.stringify((error as any).debug, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  if (casts.length === 0) {
    return (
      <div
        style={{
          background: "transparent",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          padding: "20px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            padding: "24px",
          }}
        >
          <p style={{ color: "#c1b400", fontSize: 16 }}>
            No casts found
          </p>
          <p style={{ color: "#ffffff", fontSize: 14, opacity: 0.7, marginTop: 8 }}>
            Check back later for new posts
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "transparent",
        minHeight: "100vh",
        maxWidth: "600px",
        margin: "0 auto",
        padding: "0 16px 100px",
        position: "relative",
      }}
    >
      {/* Feed Header */}
      <div
        style={{
          padding: "16px",
          marginBottom: 16,
          background: "#000000",
          border: "2px solid #c1b400",
          borderRadius: 12,
          textAlign: "center",
        }}
      >
        <h2
          style={{
            color: "#c1b400",
            fontSize: 28,
            fontWeight: 900,
            margin: 0,
            marginBottom: 8,
          }}
        >
          Live Feed
        </h2>
        <h3
          style={{
            color: "#c1b400",
            fontSize: 20,
            fontWeight: 700,
            margin: 0,
            marginBottom: 8,
          }}
        >
          Catwalk Channel
        </h3>
        <p
          style={{
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 400,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          World&apos;s First Entertainment Brand Coin
        </p>
      </div>

      {/* Feed Posts - Show first 5 */}
      {casts.slice(0, 5).map((cast) => (
        <div
          key={cast.hash}
          style={{
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            marginBottom: 24,
            overflow: "hidden",
          }}
        >
          {/* Post Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(193, 180, 0, 0.2)",
            }}
          >
            {/* Profile Picture */}
            {cast.author.pfp ? (
              <img
                src={cast.author.pfp}
                alt={cast.author.displayName}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  marginRight: 12,
                  border: "2px solid #c1b400",
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  marginRight: 12,
                  background: "#c1b400",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#000000",
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                {cast.author.displayName.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Username and Time */}
            <div style={{ flex: 1 }}>
              <a
                href={cast.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#c1b400",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  display: "block",
                }}
              >
                {cast.author.displayName}
              </a>
              <p
                style={{
                  color: "#ffffff",
                  fontSize: 12,
                  opacity: 0.6,
                  margin: 0,
                }}
              >
                @{cast.author.username} · {formatTime(cast.timestamp)}
              </p>
            </div>
          </div>

          {/* Post Images or Video */}
          {cast.images.length > 0 ? (
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                background: "#000000",
                position: "relative",
              }}
            >
              <img
                src={cast.images[0]}
                alt="Cast image"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : cast.hasVideo && cast.videoUrl ? (
            <VideoPlayer
              videoUrl={cast.videoUrl}
              autoplay={true}
              loop={true}
              muted={true}
              playsInline={true}
            />
          ) : null}

          {/* Post Content */}
          <div style={{ padding: "16px" }}>
            {/* Text Content */}
            {cast.text && (
              <p
                style={{
                  color: "#ffffff",
                  fontSize: 14,
                  lineHeight: 1.6,
                  margin: "0 0 12px 0",
                  whiteSpace: "pre-wrap",
                }}
              >
                {cast.text}
              </p>
            )}

            {/* Engagement Stats */}
            <div
              style={{
                display: "flex",
                gap: 16,
                paddingTop: 12,
                borderTop: "1px solid rgba(193, 180, 0, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#c1b400", fontSize: 16 }}>❤️</span>
                <span style={{ color: "#ffffff", fontSize: 14 }}>
                  {cast.likes}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#c1b400", fontSize: 16 }}>🔁</span>
                <span style={{ color: "#ffffff", fontSize: 14 }}>
                  {cast.recasts}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#c1b400", fontSize: 16 }}>💬</span>
                <span style={{ color: "#ffffff", fontSize: 14 }}>
                  {cast.replies}
                </span>
              </div>
              <a
                href={cast.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: "auto",
                  color: "#c1b400",
                  fontSize: 14,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                View on Warpcast →
              </a>
            </div>
          </div>
        </div>
      ))}

      {/* Action Buttons - After first 5 posts */}
      {casts.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {/* More Cats Button */}
          <button
            onClick={async () => {
              // Open the /catwalk channel within the app
              try {
                await actions.openUrl(CATWALK_CHANNEL_URL);
              } catch (err) {
                console.error("Error opening channel:", err);
              }
            }}
            style={{
              width: "100%",
              padding: "14px 20px",
              background: "#c1b400",
              color: "#000000",
              border: "2px solid #000000",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#d4c700";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#c1b400";
            }}
          >
            More Cats
          </button>

          {/* View Official Catwalk Creators Button */}
          <button
            onClick={() => {
              setShowCreatorsModal(true);
              // Fetch creators when modal opens
              if (CATWALK_CREATOR_FIDS.length > 0) {
                const fetchCreators = async () => {
                  try {
                    setLoadingCastCounts(true);
                    const fidsString = CATWALK_CREATOR_FIDS.join(",");
                    
                    // Fetch user data and cast counts in parallel
                    const [usersRes, castCountsRes] = await Promise.all([
                      fetch(`/api/users?fids=${fidsString}`),
                      fetch(`/api/creator-cast-counts?fids=${fidsString}`).catch(() => null), // Don't fail if cast counts fail
                    ]);
                    
                    const usersData = await usersRes.json();
                    let castCountsData: any = null;
                    
                    if (castCountsRes && castCountsRes.ok) {
                      try {
                        castCountsData = await castCountsRes.json();
                      } catch (e) {
                        console.error("Error parsing cast counts:", e);
                      }
                    }
                    
                    if (usersData.users) {
                      setCreators(
                        usersData.users.map((u: any) => ({
                          fid: u.fid,
                          username: u.username,
                          displayName: u.display_name,
                          pfp_url: u.pfp_url || u.pfp?.url || undefined,
                          castCount: castCountsData?.castCounts?.[u.fid], // undefined means unknown/loading
                        }))
                      );
                    } else {
                      // Fallback: just show FIDs if user fetch fails
                      setCreators(CATWALK_CREATOR_FIDS.map((fid) => ({ 
                        fid,
                        castCount: castCountsData?.castCounts?.[fid],
                      })));
                    }
                  } catch (error) {
                    console.error("Error fetching creators:", error);
                    // Fallback: just show FIDs
                    setCreators(CATWALK_CREATOR_FIDS.map((fid) => ({ fid })));
                  } finally {
                    setLoadingCastCounts(false);
                  }
                };
                fetchCreators();
              } else {
                // Placeholder: show placeholder creators if no FIDs are available
                const placeholderCount = CATWALK_CREATOR_FIDS.length > 0 ? CATWALK_CREATOR_FIDS.length : 31;
                setCreators(
                  Array.from({ length: placeholderCount }, (_, i) => ({
                    fid: 0,
                    username: undefined,
                    displayName: `Creator ${i + 1}`,
                  }))
                );
              }
            }}
            style={{
              width: "100%",
              padding: "14px 20px",
              background: "#000000",
              color: "#c1b400",
              border: "2px solid #c1b400",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1a1a1a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#000000";
            }}
          >
            View the Official Catwalk Creators
          </button>
        </div>
      )}

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
              width: "100%",
              maxWidth: "500px",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: "#c1b400", fontSize: 20, fontWeight: 700 }}>
                Official Catwalk Creators
                <p style={{ margin: 0, marginTop: 8, color: "#ffffff", fontSize: 12, opacity: 0.8 }}>
                  Thank you for sharing your cats !
                </p>
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
            
            {creators.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {creators.map((creator, index) => (
                  <div
                    key={creator.fid || index}
                    style={{
                      padding: "12px",
                      background: "#c1b400",
                      borderRadius: 8,
                      border: "1px solid #000000",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      {/* Profile Picture */}
                      {creator.pfp_url && (
                        <img
                          src={creator.pfp_url}
                          alt={creator.displayName || creator.username || "Creator"}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            border: "2px solid #000000",
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a
                          href={creator.username ? `https://warpcast.com/${creator.username}` : `https://warpcast.com/~/profile/${creator.fid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#000000",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.textDecoration = "underline";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.textDecoration = "none";
                          }}
                        >
                          <p style={{ margin: 0, color: "#000000", fontSize: 14, fontWeight: 600 }}>
                            {creator.displayName || creator.username || `FID: ${creator.fid}`}
                          </p>
                        </a>
                        {creator.username && (
                          <p style={{ margin: 0, marginTop: 4, color: "#000000", fontSize: 12, opacity: 0.7 }}>
                            @{creator.username}
                          </p>
                        )}
                        {!creator.username && creator.fid === 0 && (
                          <p style={{ margin: 0, marginTop: 4, color: "#000000", fontSize: 12, opacity: 0.7 }}>
                            Placeholder - Creator list coming soon
                          </p>
                        )}
                      </div>
                      <div style={{ marginLeft: 12, textAlign: "right" }}>
                        <p style={{ margin: 0, color: "#000000", fontSize: 12, fontWeight: 600 }}>
                          {loadingCastCounts && creator.castCount === undefined ? (
                            <span style={{ opacity: 0.5 }}>...</span>
                          ) : creator.castCount !== undefined ? (
                            `${creator.castCount} ${creator.castCount === 1 ? 'post' : 'posts'}`
                          ) : (
                            <span style={{ opacity: 0.5 }}>—</span>
                          )}
                        </p>
                        <p style={{ margin: 0, marginTop: 2, color: "#000000", fontSize: 10, opacity: 0.6 }}>
                          in channel
                        </p>
                      </div>
                    </div>
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

    </div>
  );
}

