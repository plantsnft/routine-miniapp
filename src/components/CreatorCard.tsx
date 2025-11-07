"use client";

import { useState, useEffect, useCallback } from "react";
import { useHapticFeedback } from "~/hooks/useHapticFeedback";
import { ImageCarousel } from "./ui/ImageCarousel";
import { parseCastImages, formatCastDate } from "~/lib/castUtils";

interface CreatorCardProps {
  creator: {
    fid: number;
    username?: string;
    displayName?: string;
    pfp_url?: string;
  };
  stats?: {
    cast_count: number;
    location?: string | null;
    labels?: string[];
    cat_names?: string[];
    last_cast_date?: string | null;
  };
  catProfiles?: Array<{
    cat_name: string;
    photos?: string[];
    ai_writeup?: string | null;
  }>;
  isInactive?: boolean;
}

interface CastFromDB {
  cast_hash: string;
  text?: string | null;
  images?: string[] | null;
  timestamp: string;
  likes_count?: number;
  recasts_count?: number;
  replies_count?: number;
}

// Extract country from location string (format: "City, State, Country" or just "Country")
function extractCountry(location: string | null | undefined): string | null {
  if (!location) return null;
  
  // If location contains commas, take the last part (country)
  const parts = location.split(",").map(p => p.trim());
  if (parts.length > 1) {
    return parts[parts.length - 1];
  }
  return location;
}

export function CreatorCard({ creator, stats, catProfiles: _catProfiles = [], isInactive = false }: CreatorCardProps) {
  const { triggerHaptic } = useHapticFeedback();
  const [selectedCat, setSelectedCat] = useState<typeof _catProfiles[0] | null>(null);
  const [topCasts, setTopCasts] = useState<CastFromDB[]>([]);
  const [loadingTopCasts, setLoadingTopCasts] = useState(false);
  const [selectedCastHash, setSelectedCastHash] = useState<string | null>(null);
  const [showTopCastsModal, setShowTopCastsModal] = useState(false);
  
  // Debug logging
  console.log(`[CreatorCard] FID ${creator.fid} stats:`, stats);

  // Fetch top 5 casts by likes (all-time, sorted by likes_count descending)
  const fetchTopCasts = useCallback(async () => {
    // Don't refetch if already loaded or currently loading
    const hasAlreadyLoaded = loadingTopCasts || topCasts.length > 0;
    if (hasAlreadyLoaded) return;
    
    setLoadingTopCasts(true);
    try {
      console.log(`[CreatorCard] Fetching top 5 casts (by all-time likes) for FID ${creator.fid}`);
      const res = await fetch(`/api/creator-stats/top-casts?fid=${creator.fid}`);
      if (!res.ok) {
        console.error(`[CreatorCard] API error: ${res.status} ${res.statusText}`);
        const errorText = await res.text();
        console.error(`[CreatorCard] Error response:`, errorText);
        setTopCasts([]);
        return;
      }
      const data = await res.json();
      console.log(`[CreatorCard] Received top casts data for FID ${creator.fid}:`, {
        castCount: data.casts?.length || 0,
        casts: data.casts?.map((c: CastFromDB) => ({ 
          hash: c.cast_hash.substring(0, 10), 
          likes: c.likes_count,
          timestamp: c.timestamp 
        })) || []
      });
      if (data.casts && Array.isArray(data.casts)) {
        console.log(`[CreatorCard] Setting ${data.casts.length} top casts (sorted by all-time likes) for FID ${creator.fid}`);
        setTopCasts(data.casts);
      } else {
        console.warn(`[CreatorCard] No casts in response for FID ${creator.fid}:`, data);
        setTopCasts([]);
      }
    } catch (error) {
      console.error(`[CreatorCard] Error fetching top casts for FID ${creator.fid}:`, error);
      setTopCasts([]);
    } finally {
      setLoadingTopCasts(false);
    }
  }, [creator.fid, loadingTopCasts, topCasts.length]);

  // Fetch top 5 casts by likes on mount
  useEffect(() => {
    if (creator.fid && stats?.cast_count && stats.cast_count > 0) {
      fetchTopCasts();
    }
  }, [creator.fid, stats?.cast_count, fetchTopCasts]);

  // Format date for button display (short format)
  const formatDateForButton = (timestamp: string): string => {
    return formatCastDate(timestamp, 'short');
  };

  const country = extractCountry(stats?.location);

  return (
    <>
      <div
        style={{
          padding: "16px",
          background: isInactive ? "#000000" : "#c1b400",
          borderRadius: 8,
          border: isInactive ? "1px solid #333333" : "1px solid #000000",
          opacity: isInactive ? 0.8 : 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {/* Profile Picture */}
          {creator.pfp_url && (
            <img
              src={creator.pfp_url}
              alt={creator.displayName || creator.username || "Creator"}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                border: "2px solid #000000",
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name and Location on same line */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <a
                href={creator.username ? `https://warpcast.com/${creator.username}` : `https://warpcast.com/~/profile/${creator.fid}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => triggerHaptic("light")}
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
                <p style={{ margin: 0, color: isInactive ? "#999999" : "#000000", fontSize: 16, fontWeight: 700, display: "inline" }}>
                  {creator.displayName || creator.username || `FID: ${creator.fid}`}
                </p>
              </a>
              {country && (
                <span style={{ color: isInactive ? "#666666" : "#000000", fontSize: 12, opacity: 0.7 }}>
                  · {country}
                </span>
              )}
            </div>
            {creator.username && (
              <p style={{ margin: 0, marginTop: 4, color: isInactive ? "#666666" : "#000000", fontSize: 12, opacity: 0.7 }}>
                @{creator.username}
              </p>
            )}

            {/* Stats */}
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Cast Count */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: isInactive ? "#999999" : "#000000", fontSize: 14, fontWeight: 600 }}>
                  {stats?.cast_count ?? 0} cast{(stats?.cast_count ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Top 5 Casts - Date buttons */}
              <div style={{ marginTop: 8 }}>
                {loadingTopCasts ? (
                  <div style={{ textAlign: "center", padding: "8px", color: isInactive ? "#666666" : "#000000", fontSize: 11 }}>
                    Loading top casts...
                  </div>
                ) : topCasts.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {topCasts.map((cast) => (
                      <button
                        key={cast.cast_hash}
                        onClick={() => {
                          triggerHaptic("light");
                          setSelectedCastHash(cast.cast_hash);
                          setShowTopCastsModal(true);
                        }}
                        style={{
                          background: isInactive ? "#333333" : "#000000",
                          color: isInactive ? "#999999" : "#c1b400",
                          padding: "6px 10px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          border: "none",
                          cursor: isInactive ? "default" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!isInactive) {
                            e.currentTarget.style.opacity = "0.8";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isInactive) {
                            e.currentTarget.style.opacity = "1";
                          }
                        }}
                      >
                        {formatDateForButton(cast.timestamp)}
                      </button>
                    ))}
                  </div>
                ) : stats?.cast_count && stats.cast_count > 0 ? (
                  <button
                    onClick={() => {
                      triggerHaptic("light");
                      fetchTopCasts();
                    }}
                    style={{
                      background: isInactive ? "#333333" : "#000000",
                      color: isInactive ? "#999999" : "#c1b400",
                      padding: "8px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      border: "none",
                      cursor: isInactive ? "default" : "pointer",
                      width: "100%",
                    }}
                  >
                    Load Top 5 Casts
                  </button>
                ) : (
                  <span style={{ color: isInactive ? "#666666" : "#000000", fontSize: 11, opacity: 0.6, fontStyle: "italic" }}>
                    No casts yet
                  </span>
                )}
              </div>

              {/* Cat Names - Placeholder */}
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: 0, marginBottom: 6, color: isInactive ? "#999999" : "#000000", fontSize: 12, fontWeight: 600 }}>
                  Cats:
                </p>
                <span style={{ color: isInactive ? "#666666" : "#000000", fontSize: 11, opacity: 0.7, fontStyle: "italic" }}>
                  Will be updated
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cat Profile Modal */}
      {selectedCat && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.9)",
            zIndex: 20000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => {
            triggerHaptic("light");
            setSelectedCat(null);
          }}
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
                {selectedCat.cat_name}
              </h3>
              <button
                onClick={() => {
                  triggerHaptic("light");
                  setSelectedCat(null);
                }}
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

            {/* Photos */}
            {selectedCat.photos && selectedCat.photos.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <ImageCarousel images={selectedCat.photos} />
              </div>
            )}

            {/* AI Writeup */}
            {selectedCat.ai_writeup && (
              <div style={{ marginTop: 16 }}>
                <p style={{ color: "#ffffff", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  {selectedCat.ai_writeup}
                </p>
              </div>
            )}

            {!selectedCat.ai_writeup && !selectedCat.photos?.length && (
              <p style={{ color: "#ffffff", fontSize: 14, opacity: 0.6, textAlign: "center", margin: 0 }}>
                No additional information available for {selectedCat.cat_name} yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top 5 Casts Modal */}
      {showTopCastsModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.9)",
            zIndex: 20000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => {
            triggerHaptic("light");
            setShowTopCastsModal(false);
            setSelectedCastHash(null);
          }}
        >
          <div
            style={{
              background: "#000000",
              border: "3px solid #c1b400",
              borderRadius: 16,
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: "#c1b400", fontSize: 20, fontWeight: 700 }}>
                Top 5 Casts
              </h3>
              <button
                onClick={() => {
                  triggerHaptic("light");
                  setShowTopCastsModal(false);
                  setSelectedCastHash(null);
                }}
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

            {loadingTopCasts ? (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <p style={{ color: "#ffffff", fontSize: 14 }}>Loading top casts...</p>
              </div>
            ) : topCasts.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {(() => {
                  // Reorder casts: selected cast first, then others
                  const orderedCasts = [...topCasts];
                  if (selectedCastHash) {
                    const selectedIndex = orderedCasts.findIndex(c => c.cast_hash === selectedCastHash);
                    if (selectedIndex > 0) {
                      const selectedCast = orderedCasts[selectedIndex];
                      orderedCasts.splice(selectedIndex, 1);
                      orderedCasts.unshift(selectedCast);
                    }
                  }
                  
                  return orderedCasts.map((cast, index) => {
                    const isSelectedCast = index === 0 && selectedCastHash === cast.cast_hash;
                    
                    // Parse images using shared utility
                    const images = parseCastImages(cast.images);
                    
                    // Format date using shared utility
                    const dateStr = formatCastDate(cast.timestamp, 'long');
                    
                    return (
                      <div
                        key={cast.cast_hash}
                        style={{
                          background: "#1a1a1a",
                          border: isSelectedCast ? "3px solid #c1b400" : "2px solid #c1b400",
                          borderRadius: isSelectedCast ? 12 : 10,
                          padding: isSelectedCast ? "20px" : "16px",
                          overflow: "hidden",
                        }}
                      >
                        {/* Date Header - Prominent */}
                        <div style={{ 
                          marginBottom: isSelectedCast ? 16 : 12, 
                          paddingBottom: isSelectedCast ? 10 : 8, 
                          borderBottom: isSelectedCast ? "2px solid rgba(193, 180, 0, 0.5)" : "2px solid rgba(193, 180, 0, 0.4)" 
                        }}>
                          <p style={{ 
                            margin: 0, 
                            color: "#c1b400", 
                            fontSize: isSelectedCast ? 16 : 15, 
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px"
                          }}>
                            {dateStr}
                          </p>
                        </div>

                        {/* Cast Text */}
                        {cast.text && (
                          <p
                            style={{
                              color: "#ffffff",
                              fontSize: isSelectedCast ? 14 : 13,
                              lineHeight: isSelectedCast ? 1.6 : 1.5,
                              margin: "0 0 16px 0",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              ...(isSelectedCast ? {} : {
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              })
                            }}
                          >
                            {cast.text}
                          </p>
                        )}

                        {/* Cast Images - Full carousel */}
                        {images.length > 0 && (
                          <div style={{ marginTop: 12, marginBottom: isSelectedCast ? 16 : 12 }}>
                            <ImageCarousel images={images} alt="Cast image" />
                          </div>
                        )}

                        {/* Engagement Stats - Prominent at bottom */}
                        <div
                          style={{
                            display: "flex",
                            gap: 20,
                            paddingTop: 16,
                            paddingBottom: 8,
                            borderTop: "2px solid rgba(193, 180, 0, 0.3)",
                            alignItems: "center",
                            marginTop: 16,
                            backgroundColor: "rgba(26, 26, 26, 0.5)",
                            borderRadius: 8,
                            padding: "12px 16px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#c1b400", fontSize: 16, fontWeight: 700 }}>❤️</span>
                            <span style={{ color: "#ffffff", fontSize: 14, fontWeight: 600 }}>
                              {cast.likes_count || 0}
                            </span>
                            <span style={{ color: "#999999", fontSize: 11, marginLeft: 2 }}>likes</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#c1b400", fontSize: 16, fontWeight: 700 }}>🔁</span>
                            <span style={{ color: "#ffffff", fontSize: 14, fontWeight: 600 }}>
                              {cast.recasts_count || 0}
                            </span>
                            <span style={{ color: "#999999", fontSize: 11, marginLeft: 2 }}>recasts</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#c1b400", fontSize: 16, fontWeight: 700 }}>💬</span>
                            <span style={{ color: "#ffffff", fontSize: 14, fontWeight: 600 }}>
                              {cast.replies_count || 0}
                            </span>
                            <span style={{ color: "#999999", fontSize: 11, marginLeft: 2 }}>comments</span>
                          </div>
                          <div style={{ flex: 1 }} />
                          <a
                            href={`https://warpcast.com/~/conversations/${cast.cast_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => triggerHaptic("light")}
                            style={{
                              color: "#c1b400",
                              textDecoration: "none",
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "6px 12px",
                              border: "1px solid #c1b400",
                              borderRadius: 6,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "rgba(193, 180, 0, 0.1)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            View on Warpcast
                          </a>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <p style={{ color: "#ffffff", fontSize: 14, opacity: 0.6, textAlign: "center", margin: 0 }}>
                No casts found.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

