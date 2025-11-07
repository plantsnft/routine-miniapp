"use client";

import { useState, useEffect } from "react";
import DailyCheckin from "~/app/daily-checkin";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";
import { useHapticFeedback } from "~/hooks/useHapticFeedback";
import { Tab } from "~/components/App";
import { CreatorCard } from "~/components/CreatorCard";

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
interface HomeTabProps {
  setActiveTab?: (tab: Tab) => void;
}

export function HomeTab({ setActiveTab }: HomeTabProps) {
  const { triggerHaptic } = useHapticFeedback();
  const keywords = ["Leashes", "Backpacks", "Strollers", "Traveling", "Car Rides", "Off Leash", "+ More"];
  const [currentKeywordIndex, setCurrentKeywordIndex] = useState(0);
  const [followers, setFollowers] = useState<number | null>(null);
  const [loadingChannelStats, setLoadingChannelStats] = useState(true);
  const [showCreatorsModal, setShowCreatorsModal] = useState(false);
  const [creators, setCreators] = useState<Array<{ fid: number; username?: string; displayName?: string; pfp_url?: string }>>([]);
  const [creatorStats, setCreatorStats] = useState<Record<number, { cast_count: number; location?: string | null; labels?: string[]; cat_names?: string[]; last_cast_date?: string | null }>>({});
  const [catProfiles, setCatProfiles] = useState<Record<number, Array<{ cat_name: string; photos?: string[]; ai_writeup?: string | null }>>>({});
  const [loadingCreatorStats, setLoadingCreatorStats] = useState(false);
  const [activeFids, setActiveFids] = useState<number[]>([]);
  const [inactiveFids, setInactiveFids] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<"recent" | "overall">("recent");

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
        setLoadingChannelStats(false);
      }
    };
    fetchStats();
  }, []);

  // Fetch creator details and stats when modal opens
  useEffect(() => {
    if (showCreatorsModal && CATWALK_CREATOR_FIDS.length > 0) {
      const fetchCreatorsAndStats = async () => {
        setLoadingCreatorStats(true);
        try {
          // Fetch creator user info
          const fidsString = CATWALK_CREATOR_FIDS.join(",");
          const usersRes = await fetch(`/api/users?fids=${fidsString}`);
          const usersData = await usersRes.json();
          
          if (usersData.users) {
            setCreators(
              usersData.users.map((u: any) => ({
                fid: u.fid,
                username: u.username,
                displayName: u.display_name,
                pfp_url: u.pfp_url || u.pfp?.url || undefined,
              }))
            );
          } else {
            // Fallback: just show FIDs if user fetch fails
            setCreators(CATWALK_CREATOR_FIDS.map((fid) => ({ fid })));
          }

          // Fetch creator stats
          const statsRes = await fetch("/api/creator-stats");
          const statsData = await statsRes.json();
          
          console.log("[HomeTab] Creator stats data:", statsData);
          
          if (statsData.active || statsData.inactive || statsData.missing) {
            const active = statsData.active || [];
            const inactive = statsData.inactive || [];
            const missing = statsData.missing || [];
            
            setActiveFids(active.map((c: any) => c.fid));
            setInactiveFids(inactive.map((c: any) => c.fid));
            
            // Combine all creators (active, inactive, and missing)
            const allCreators = [...active, ...inactive, ...missing];
            const statsMap: Record<number, any> = {};
            allCreators.forEach((creator: any) => {
              // Ensure arrays are properly parsed (Supabase might return them as strings)
              const stats = {
                ...creator,
                cat_names: Array.isArray(creator.cat_names) 
                  ? creator.cat_names 
                  : typeof creator.cat_names === 'string' 
                    ? JSON.parse(creator.cat_names || '[]') 
                    : [],
                labels: Array.isArray(creator.labels) 
                  ? creator.labels 
                  : typeof creator.labels === 'string' 
                    ? JSON.parse(creator.labels || '[]') 
                    : [],
              };
              statsMap[creator.fid] = stats;
              console.log(`[HomeTab] FID ${creator.fid} stats:`, stats);
            });
            setCreatorStats(statsMap);

            // Fetch cat profiles for each creator
            const profilesMap: Record<number, any[]> = {};
            await Promise.all(
              allCreators.map(async (creator: any) => {
                if (creator.cat_names && creator.cat_names.length > 0) {
                  try {
                    const profileRes = await fetch(`/api/creator-stats?fid=${creator.fid}`);
                    const profileData = await profileRes.json();
                    if (profileData.catProfiles) {
                      profilesMap[creator.fid] = profileData.catProfiles;
                    }
                  } catch (error) {
                    console.error(`Error fetching cat profiles for FID ${creator.fid}:`, error);
                  }
                }
              })
            );
            setCatProfiles(profilesMap);
          }
        } catch (error) {
          console.error("Error fetching creators/stats:", error);
          // Fallback: just show FIDs
          setCreators(CATWALK_CREATOR_FIDS.map((fid) => ({ fid })));
        } finally {
          setLoadingCreatorStats(false);
        }
      };
      fetchCreatorsAndStats();
    }
  }, [showCreatorsModal]);

  return (
    <div 
      className="px-6" 
      style={{ 
        background: "transparent",
        position: "relative",
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      <div className="max-w-md mx-auto" style={{ position: "relative", zIndex: 1 }}>

        {/* Featured Photo - Add your photo here */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
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
            marginTop: 16,
            marginBottom: 16,
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
            onClick={() => triggerHaptic("light")}
            style={{
              textAlign: "center",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            <p style={{ margin: 0, color: "#c1b400", fontSize: 12, fontWeight: 600 }}>
              /Catwalk Channel Fans
            </p>
            <p style={{ margin: 0, color: "#ffffff", fontSize: 20, fontWeight: 700 }}>
              {loadingChannelStats ? "..." : followers !== null ? followers.toLocaleString() : "—"}
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
            onClick={() => {
              triggerHaptic("light");
              setShowCreatorsModal(true);
            }}
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
            marginTop: 16,
            marginBottom: 16,
            padding: "12px 16px",
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
              onClick={() => triggerHaptic("light")}
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
            On Farcaster, Catwalk lets creators share cat adventures and earn{" "}
            <a
              href="https://app.uniswap.org/swap?chain=base&outputCurrency=0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => triggerHaptic("light")}
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
              $CATWALK
            </a>
            , a token funded by trading fees and advertising revenue
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

        {/* Navigation Buttons */}
        <div
          style={{
            marginTop: 16,
            marginBottom: 16,
            display: "flex",
            gap: 12,
            width: "100%",
          }}
        >
          <button
            onClick={() => {
              triggerHaptic("light");
              if (setActiveTab) {
                setActiveTab(Tab.Leaderboard);
              }
            }}
            style={{
              flex: 1,
              padding: "12px 16px",
              background: "#000000",
              border: "2px solid #c1b400",
              borderRadius: 12,
              color: "#c1b400",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
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
            Visit Leaderboard
          </button>
          <button
            onClick={() => {
              triggerHaptic("light");
              if (setActiveTab) {
                setActiveTab(Tab.Feed);
              }
            }}
            style={{
              flex: 1,
              padding: "12px 16px",
              background: "#000000",
              border: "2px solid #c1b400",
              borderRadius: 12,
              color: "#c1b400",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
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
            View Feed
          </button>
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
          onClick={() => {
            triggerHaptic("light");
            setShowCreatorsModal(false);
            setCreators([]); // Reset creators when modal closes
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
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: "#c1b400", fontSize: 20, fontWeight: 700 }}>
                  Official Catwalk Creators
                  <p style={{ margin: 0, marginTop: 8, color: "#ffffff", fontSize: 12, opacity: 0.8 }}>
                    Thank you for sharing your cats !
                  </p>
                </h3>
                <button
                  onClick={() => {
                    triggerHaptic("light");
                    setShowCreatorsModal(false);
                    setCreators([]); // Reset creators when modal closes
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
              
              {/* Sorting Buttons */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => {
                    triggerHaptic("light");
                    setSortBy("recent");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    background: sortBy === "recent" ? "#c1b400" : "#333333",
                    color: sortBy === "recent" ? "#000000" : "#ffffff",
                    border: `1px solid ${sortBy === "recent" ? "#000000" : "#666666"}`,
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Most Recent
                </button>
                <button
                  onClick={() => {
                    triggerHaptic("light");
                    setSortBy("overall");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    background: sortBy === "overall" ? "#c1b400" : "#333333",
                    color: sortBy === "overall" ? "#000000" : "#ffffff",
                    border: `1px solid ${sortBy === "overall" ? "#000000" : "#666666"}`,
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Most Overall
                </button>
              </div>
            </div>
            
            {loadingCreatorStats ? (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <p style={{ color: "#ffffff", fontSize: 14 }}>Loading creator stats...</p>
              </div>
            ) : CATWALK_CREATOR_FIDS.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sortBy === "recent" ? (
                  // Most Recent: Show active first, then inactive
                  <>
                    {/* Active Creators */}
                    {activeFids.length > 0 && (
                      <>
                        <h4 style={{ margin: 0, color: "#c1b400", fontSize: 16, fontWeight: 700 }}>
                          Active Creators
                        </h4>
                        {creators
                          .filter(c => activeFids.includes(c.fid))
                          .sort((a, b) => {
                            const aStats = creatorStats[a.fid];
                            const bStats = creatorStats[b.fid];
                            // Sort by most recent cast date
                            const aDate = aStats?.last_cast_date ? new Date(aStats.last_cast_date).getTime() : 0;
                            const bDate = bStats?.last_cast_date ? new Date(bStats.last_cast_date).getTime() : 0;
                            return bDate - aDate;
                          })
                          .map((creator) => (
                            <CreatorCard
                              key={creator.fid}
                              creator={creator}
                              stats={creatorStats[creator.fid]}
                              catProfiles={catProfiles[creator.fid] || []}
                              isInactive={false}
                            />
                          ))}
                      </>
                    )}

                    {/* Inactive Creators */}
                    {inactiveFids.length > 0 && (
                      <>
                        {activeFids.length > 0 && (
                          <div style={{ marginTop: 8, marginBottom: 8 }}>
                            <hr style={{ borderColor: "#333333", borderWidth: 1, margin: 0 }} />
                          </div>
                        )}
                        <h4 style={{ margin: 0, color: "#999999", fontSize: 16, fontWeight: 700 }}>
                          Inactive Creators
                        </h4>
                        {creators
                          .filter(c => inactiveFids.includes(c.fid))
                          .sort((a, b) => {
                            const aStats = creatorStats[a.fid];
                            const bStats = creatorStats[b.fid];
                            // Sort by most recent cast date
                            const aDate = aStats?.last_cast_date ? new Date(aStats.last_cast_date).getTime() : 0;
                            const bDate = bStats?.last_cast_date ? new Date(bStats.last_cast_date).getTime() : 0;
                            return bDate - aDate;
                          })
                          .map((creator) => (
                            <CreatorCard
                              key={creator.fid}
                              creator={creator}
                              stats={creatorStats[creator.fid]}
                              catProfiles={catProfiles[creator.fid] || []}
                              isInactive={true}
                            />
                          ))}
                      </>
                    )}

                    {/* Creators without stats */}
                    {creators
                      .filter(c => !activeFids.includes(c.fid) && !inactiveFids.includes(c.fid))
                      .map((creator) => (
                        <CreatorCard
                          key={creator.fid}
                          creator={creator}
                          stats={creatorStats[creator.fid]}
                          catProfiles={catProfiles[creator.fid] || []}
                          isInactive={true}
                        />
                      ))}
                  </>
                ) : (
                  // Most Overall: Show ALL creators ranked by cast count (active/inactive mixed together)
                  creators
                    .sort((a, b) => {
                      const aStats = creatorStats[a.fid];
                      const bStats = creatorStats[b.fid];
                      // Sort by total cast count (highest first)
                      return (bStats?.cast_count || 0) - (aStats?.cast_count || 0);
                    })
                    .map((creator) => {
                      const isInactive = !activeFids.includes(creator.fid);
                      return (
                        <CreatorCard
                          key={creator.fid}
                          creator={creator}
                          stats={creatorStats[creator.fid]}
                          catProfiles={catProfiles[creator.fid] || []}
                          isInactive={isInactive}
                        />
                      );
                    })
                )}
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