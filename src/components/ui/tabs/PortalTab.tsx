"use client";

import { useState, useEffect } from "react";
import { useMiniApp } from "@neynar/react";
import { useHapticFeedback } from "~/hooks/useHapticFeedback";

interface CreatorCast {
  castHash: string;
  castUrl: string;
  text?: string;
  timestamp: number;
  rewardAmount: number;
  hasClaimed: boolean;
  transactionHash?: string;
  verifiedAt?: string;
  claimedAt?: string;
}

interface CreatorVerifyResponse {
  fid: number;
  creatorCasts: CreatorCast[];
  claimableCasts: CreatorCast[];
  claimedCasts: CreatorCast[];
  totalCasts: number;
  claimableCount: number;
  claimedCount: number;
  totalClaimableReward: number;
  totalClaimedReward: number;
  rewardPerCast: number;
  error?: string;
}

interface EngagementOpportunity {
  castHash: string;
  castUrl: string;
  authorUsername?: string;
  authorDisplayName?: string;
  text?: string;
  timestamp: number;
  availableActions: Array<{
    type: "like" | "comment" | "recast";
    rewardAmount: number;
  }>;
}

interface ClaimableReward {
  castHash: string;
  castUrl: string;
  authorUsername?: string;
  authorDisplayName?: string;
  text?: string;
  timestamp: number;
  claimableActions: Array<{
    type: "like" | "comment" | "recast";
    rewardAmount: number;
  }>;
}

interface EngagementOpportunitiesResponse {
  eligibleCount: number;
  opportunities: EngagementOpportunity[];
  totalReward: number;
  claimableCount: number;
  claimableRewards: ClaimableReward[];
  totalClaimableReward: number;
  error?: string;
}

export function PortalTab() {
  const { context, actions } = useMiniApp();
  const { triggerHaptic } = useHapticFeedback();
  const userFid = context?.user?.fid;

  // Creator casts state
  const [creatorCasts, setCreatorCasts] = useState<CreatorCast[]>([]);
  const [claimableCreatorCasts, setClaimableCreatorCasts] = useState<CreatorCast[]>([]);
  const [creatorTotalClaimable, setCreatorTotalClaimable] = useState(0);
  
  // Engagement state
  const [engagementOpportunities, setEngagementOpportunities] = useState<EngagementOpportunity[]>([]);
  const [claimableRewards, setClaimableRewards] = useState<ClaimableReward[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimingCast, setClaimingCast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [transactionUrl, setTransactionUrl] = useState<string | null>(null);

  // Fetch all data on mount
  useEffect(() => {
    if (userFid) {
      fetchAllData();
      
      // Auto-poll every 5 minutes
      const pollInterval = setInterval(() => {
        console.log("[PortalTab] Auto-polling for updates...");
        fetchAllData();
      }, 5 * 60 * 1000);

      return () => clearInterval(pollInterval);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFid]);

  const fetchAllData = async () => {
    if (!userFid) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch creator casts and engagement opportunities in parallel
      const [creatorRes, engagementRes] = await Promise.all([
        fetch("/api/portal/creator/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fid: userFid }),
        }),
        fetch("/api/portal/engagement/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fid: userFid }),
        }),
      ]);

      // Process creator data
      if (creatorRes.ok) {
        const creatorData = await creatorRes.json() as CreatorVerifyResponse;
        setCreatorCasts(creatorData.creatorCasts || []);
        setClaimableCreatorCasts(creatorData.claimableCasts || []);
        setCreatorTotalClaimable(creatorData.totalClaimableReward || 0);
        console.log(`[PortalTab] Found ${creatorData.claimableCount} claimable creator casts worth ${creatorData.totalClaimableReward} CATWALK`);
      } else {
        console.log("[PortalTab] Creator verify returned non-OK status");
      }

      // Process engagement data
      if (engagementRes.ok) {
        const engagementData = await engagementRes.json() as EngagementOpportunitiesResponse;
        setEngagementOpportunities(engagementData.opportunities || []);
        setClaimableRewards(engagementData.claimableRewards || []);
        console.log(`[PortalTab] Found ${engagementData.claimableCount} claimable engagement rewards`);
      }
    } catch (err: any) {
      console.error("[PortalTab] Error fetching data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleClaimCreatorCast = async (castHash: string) => {
    if (!userFid || claimingCast) return;

    try {
      setClaimingCast(castHash);
      setClaiming(true);
      setError(null);
      setSuccess(null);
      setTransactionUrl(null);
      triggerHaptic("medium");

      const res = await fetch("/api/portal/creator/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid: userFid, castHash }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Claim failed");
      }

      // Show success with BaseScan link
      setSuccess(`✅ Claimed 1,000,000 CATWALK for your cast!`);
      if (data.basescanUrl) {
        setTransactionUrl(data.basescanUrl);
      }
      triggerHaptic("heavy");

      // Refresh data
      setTimeout(() => fetchAllData(), 1000);
    } catch (err: any) {
      console.error("[PortalTab] Error claiming creator reward:", err);
      setError(err.message || "Failed to claim reward");
      triggerHaptic("rigid");
    } finally {
      setClaiming(false);
      setClaimingCast(null);
    }
  };

  const handleClaimEngagement = async (castHash: string, engagementType: string) => {
    if (!userFid || claiming) return;

    try {
      setClaiming(true);
      setError(null);
      setSuccess(null);
      setTransactionUrl(null);
      triggerHaptic("medium");

      const res = await fetch("/api/portal/engagement/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid: userFid, castHash, engagementType }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Claim failed");
      }

      // Show success with BaseScan link
      const basescanUrl = data.basescanUrl || (data.transactionHash ? `https://basescan.org/tx/${data.transactionHash}` : null);
      setSuccess(`✅ Claimed ${data.rewardAmount?.toLocaleString() || ''} CATWALK!`);
      if (basescanUrl) {
        setTransactionUrl(basescanUrl);
      }
      triggerHaptic("heavy");
      
      // Refresh data
      setTimeout(() => fetchAllData(), 1000);
    } catch (err: any) {
      console.error("[PortalTab] Error claiming engagement reward:", err);
      setError(err.message || "Failed to claim reward");
      triggerHaptic("rigid");
    } finally {
      setClaiming(false);
    }
  };

  const handleVerifyEngagement = async () => {
    if (!userFid) return;

    try {
      setVerifying(true);
      setError(null);
      setSuccess(null);
      triggerHaptic("medium");

      const res = await fetch("/api/portal/engagement/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid: userFid }),
      });

      const data = await res.json() as EngagementOpportunitiesResponse;

      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setSuccess(`Found ${data.opportunities.length} engagement opportunity(s)!`);
      setEngagementOpportunities(data.opportunities || []);
      setClaimableRewards(data.claimableRewards || []);
      triggerHaptic("heavy");
    } catch (err: any) {
      console.error("[PortalTab] Error verifying engagement:", err);
      setError(err.message || "Failed to verify engagement");
      triggerHaptic("rigid");
    } finally {
      setVerifying(false);
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (!userFid) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p style={{ color: "#ffffff", fontSize: 16, marginBottom: 16 }}>
          Please sign in to access the Portal
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1
        style={{
          color: "#c1b400",
          fontSize: 28,
          fontWeight: 900,
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        🎁 Creator Portal
      </h1>
      <p
        style={{
          color: "#999999",
          fontSize: 14,
          textAlign: "center",
          marginBottom: 32,
        }}
      >
        Earn CATWALK for posting and engaging in /catwalk
      </p>

      {/* Error/Success Messages */}
      {error && (
        <div
          style={{
            background: "#ff4444",
            color: "#ffffff",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            background: "#00ff00",
            color: "#000000",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {success}
          {transactionUrl && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  triggerHaptic("light");
                  try {
                    if (actions?.openUrl) {
                      await actions.openUrl(transactionUrl);
                    } else {
                      window.open(transactionUrl, "_blank", "noopener,noreferrer");
                    }
                  } catch (err) {
                    console.error("Error opening URL:", err);
                    window.open(transactionUrl, "_blank", "noopener,noreferrer");
                  }
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 16px",
                  background: "#000000",
                  color: "#00ff00",
                  border: "2px solid #000000",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 700,
                  textAlign: "center",
                  cursor: "pointer",
                }}
              >
                📜 View Transaction on BaseScan →
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#ffffff" }}>
          <p>Loading rewards...</p>
        </div>
      ) : (
        <>
          {/* CREATOR REWARDS SECTION - 1M CATWALK per cast */}
          {claimableCreatorCasts.length > 0 && (
            <div
              style={{
                background: "#1a0a2a",
                border: "3px solid #c1b400",
                borderRadius: 12,
                padding: "24px",
                marginBottom: 24,
              }}
            >
              <h2
                style={{
                  color: "#c1b400",
                  fontSize: 22,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                🐱 CREATOR REWARDS
              </h2>
              <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 8, lineHeight: 1.6 }}>
                Claim <strong style={{ color: "#c1b400" }}>1,000,000 CATWALK</strong> for each cast you&apos;ve made in /catwalk!
              </p>
              <p style={{ color: "#999999", fontSize: 12, marginBottom: 16, lineHeight: 1.4 }}>
                Casts from the last 15 days are eligible. You have {claimableCreatorCasts.length} cast(s) to claim.
              </p>
              
              <div style={{ 
                background: "#000", 
                padding: "12px 16px", 
                borderRadius: 8, 
                marginBottom: 16,
                border: "1px solid #c1b400",
              }}>
                <p style={{ color: "#c1b400", fontSize: 18, fontWeight: 700, margin: 0 }}>
                  Total Claimable: {creatorTotalClaimable.toLocaleString()} CATWALK
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "400px", overflowY: "auto" }}>
                {claimableCreatorCasts.map((cast) => (
                  <div
                    key={cast.castHash}
                    style={{
                      background: "#000000",
                      border: "2px solid #c1b400",
                      borderRadius: 8,
                      padding: "16px",
                    }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ color: "#999999", fontSize: 12, margin: "0 0 4px 0" }}>
                        Posted {formatDate(cast.timestamp)}
                      </p>
                      {cast.text && (
                        <p style={{ color: "#ffffff", fontSize: 14, margin: "0 0 8px 0", lineHeight: 1.4 }}>
                          {cast.text}
                        </p>
                      )}
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#c1b400", fontSize: 16, fontWeight: 700 }}>
                        +1,000,000 CATWALK
                      </span>
                      <button
                        onClick={() => handleClaimCreatorCast(cast.castHash)}
                        disabled={claiming || claimingCast === cast.castHash}
                        style={{
                          padding: "10px 20px",
                          background: "#c1b400",
                          color: "#000000",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: claiming ? "not-allowed" : "pointer",
                          opacity: claiming ? 0.6 : 1,
                        }}
                      >
                        {claimingCast === cast.castHash ? "CLAIMING..." : "CLAIM"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Show claimed creator casts summary */}
          {creatorCasts.length > 0 && claimableCreatorCasts.length === 0 && (
            <div
              style={{
                background: "#1a1a1a",
                border: "2px solid #333",
                borderRadius: 12,
                padding: "24px",
                marginBottom: 24,
              }}
            >
              <h2 style={{ color: "#999", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                🐱 Creator Rewards
              </h2>
              <p style={{ color: "#666", fontSize: 14, margin: 0 }}>
                You&apos;ve claimed all available creator rewards! Post more to /catwalk to earn 1M CATWALK per cast.
              </p>
            </div>
          )}

          {/* ENGAGEMENT CLAIM REWARDS SECTION */}
          {claimableRewards.length > 0 && (
            <div
              style={{
                background: "#0a1a0a",
                border: "3px solid #00ff00",
                borderRadius: 12,
                padding: "24px",
                marginBottom: 24,
              }}
            >
              <h2
                style={{
                  color: "#00ff00",
                  fontSize: 22,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                💰 ENGAGEMENT REWARDS
              </h2>
              <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
                You&apos;ve completed these actions! Click &quot;Claim&quot; to receive your CATWALK tokens.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "400px", overflowY: "auto" }}>
                {claimableRewards.map((reward) => (
                  <div
                    key={reward.castHash}
                    style={{
                      background: "#000000",
                      border: "2px solid #00ff00",
                      borderRadius: 8,
                      padding: "16px",
                    }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ color: "#ffffff", fontSize: 14, fontWeight: 600, margin: "0 0 4px 0" }}>
                        {reward.authorDisplayName || reward.authorUsername || "Unknown"}
                      </p>
                      {reward.text && (
                        <p style={{ color: "#999999", fontSize: 12, margin: "0 0 8px 0", lineHeight: 1.4 }}>
                          {reward.text}
                        </p>
                      )}
                    </div>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {reward.claimableActions.map((action) => (
                        <div
                          key={action.type}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 14px",
                            background: "#0a2a0a",
                            borderRadius: 6,
                            border: "1px solid #00ff00",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 18 }}>
                              {action.type === "like" && "❤️"}
                              {action.type === "comment" && "💬"}
                              {action.type === "recast" && "🔁"}
                            </span>
                            <span style={{ color: "#00ff00", fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>
                              {action.type} ✓
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ color: "#00ff00", fontSize: 14, fontWeight: 700 }}>
                              +{action.rewardAmount.toLocaleString()}
                            </span>
                            <button
                              onClick={() => handleClaimEngagement(reward.castHash, action.type)}
                              disabled={claiming}
                              style={{
                                padding: "8px 16px",
                                background: "#00ff00",
                                color: "#000000",
                                border: "none",
                                borderRadius: 6,
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: claiming ? "not-allowed" : "pointer",
                                opacity: claiming ? 0.6 : 1,
                              }}
                            >
                              CLAIM
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Engagement Opportunities Section */}
          <div
            style={{
              background: "#1a1a1a",
              border: "2px solid #c1b400",
              borderRadius: 12,
              padding: "24px",
            }}
          >
            <h2
              style={{
                color: "#c1b400",
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              💬 Engagement Opportunities
            </h2>
            <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
              Like, comment, or recast posts in the /catwalk channel to earn rewards. Click on any cast below to engage.
            </p>
            <p style={{ color: "#999999", fontSize: 12, marginBottom: 20, lineHeight: 1.4 }}>
              All casts from the last 15 days are shown. Complete the actions, then claim your rewards above.
            </p>

            {engagementOpportunities.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 12, fontWeight: 600 }}>
                  <strong>{engagementOpportunities.length}</strong> engagement opportunity(s) available
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "500px", overflowY: "auto" }}>
                  {engagementOpportunities.map((opportunity) => (
                    <div
                      key={opportunity.castHash}
                      style={{
                        background: "#000000",
                        border: "2px solid #c1b400",
                        borderRadius: 8,
                        padding: "16px",
                      }}
                    >
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ color: "#ffffff", fontSize: 14, fontWeight: 600, margin: "0 0 4px 0" }}>
                          {opportunity.authorDisplayName || opportunity.authorUsername || "Unknown"}
                        </p>
                        {opportunity.text && (
                          <p style={{ color: "#999999", fontSize: 12, margin: "0 0 8px 0", lineHeight: 1.4 }}>
                            {opportunity.text}
                          </p>
                        )}
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                        {opportunity.availableActions.map((action) => (
                          <div
                            key={action.type}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 12px",
                              background: "#1a1a1a",
                              borderRadius: 6,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 16 }}>
                                {action.type === "like" && "❤️"}
                                {action.type === "comment" && "💬"}
                                {action.type === "recast" && "🔁"}
                              </span>
                              <span style={{ color: "#ffffff", fontSize: 14, textTransform: "capitalize" }}>
                                {action.type}
                              </span>
                            </div>
                            <span style={{ color: "#c1b400", fontSize: 14, fontWeight: 600 }}>
                              +{action.rewardAmount.toLocaleString()} CATWALK
                            </span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={async () => {
                          triggerHaptic("light");
                          try {
                            if (actions?.openUrl) {
                              await actions.openUrl(opportunity.castUrl);
                            } else {
                              window.open(opportunity.castUrl, "_blank", "noopener,noreferrer");
                            }
                          } catch (err) {
                            console.error("Error opening cast URL:", err);
                            window.open(opportunity.castUrl, "_blank", "noopener,noreferrer");
                          }
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 16px",
                          background: "#c1b400",
                          color: "#000000",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 14,
                          fontWeight: 700,
                          textAlign: "center",
                          cursor: "pointer",
                        }}
                      >
                        Open Cast in Warpcast
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <button
                onClick={handleVerifyEngagement}
                disabled={verifying}
                style={{
                  width: "100%",
                  padding: "12px 24px",
                  background: "#c1b400",
                  color: "#000000",
                  border: "2px solid #000000",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: verifying ? "not-allowed" : "pointer",
                  opacity: verifying ? 0.6 : 1,
                }}
              >
                {verifying ? "Loading Opportunities..." : "Find Engagement Opportunities"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
