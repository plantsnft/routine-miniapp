"use client";

import { useState, useEffect } from "react";
import { useMiniApp } from "@neynar/react";
import { useHapticFeedback } from "~/hooks/useHapticFeedback";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";

interface CreatorClaimStatus {
  isEligible: boolean;
  hasClaimed: boolean;
  castHash?: string;
  rewardAmount?: number;
  transactionHash?: string;
  verifiedAt?: string;
}

interface EngagementClaimStatus {
  eligibleCount: number;
  claimedCount: number;
  totalReward: number;
  claims: Array<{
    castHash: string;
    engagementType: "like" | "comment" | "recast";
    rewardAmount: number;
    claimed: boolean;
  }>;
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

  const [creatorClaimStatus, setCreatorClaimStatus] = useState<CreatorClaimStatus | null>(null);
  const [engagementClaimStatus, setEngagementClaimStatus] = useState<EngagementClaimStatus | null>(null);
  const [engagementOpportunities, setEngagementOpportunities] = useState<EngagementOpportunity[]>([]);
  const [claimableRewards, setClaimableRewards] = useState<ClaimableReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isCreator = userFid && CATWALK_CREATOR_FIDS.includes(userFid);

  // Fetch claim status on mount and auto-poll every 5 minutes
  useEffect(() => {
    if (userFid) {
      fetchClaimStatus();
      
      // Auto-poll every 5 minutes to detect new casts
      const pollInterval = setInterval(() => {
        console.log("[PortalTab] Auto-polling for new claims...");
        fetchClaimStatus();
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(pollInterval);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFid]);

  const fetchClaimStatus = async () => {
    if (!userFid) return;

    try {
      setLoading(true);
      setError(null);

      // First check status
      const statusRes = await fetch(`/api/portal/status?fid=${userFid}`);
      if (!statusRes.ok) {
        throw new Error("Failed to fetch claim status");
      }

      const statusData = await statusRes.json();
      setCreatorClaimStatus(statusData.creator || null);
      setEngagementClaimStatus(statusData.engagement || null);

      // If no creator claim exists yet, try to auto-verify
      // This allows claims to become available within 5 minutes of posting
      if (isCreator && !statusData.creator) {
        console.log("[PortalTab] No claim found, attempting auto-verify...");
        try {
          const verifyRes = await fetch("/api/portal/creator/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fid: userFid }),
          });

          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.isEligible) {
              console.log("[PortalTab] Auto-verified new cast!");
              setCreatorClaimStatus(verifyData);
              setSuccess("New cast detected! You can now claim your reward.");
            }
          }
        } catch (verifyErr) {
          // Silent fail - user might not have posted yet
          console.log("[PortalTab] Auto-verify failed (expected if no new cast):", verifyErr);
        }
      }

      // Auto-fetch engagement opportunities AND claimable rewards
      console.log("[PortalTab] Fetching engagement opportunities and claimable rewards...");
      try {
        const verifyEngRes = await fetch("/api/portal/engagement/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fid: userFid }),
        });

        if (verifyEngRes.ok) {
          const verifyEngData = await verifyEngRes.json() as EngagementOpportunitiesResponse;
          
          // Set opportunities (actions not yet done)
          if (verifyEngData.opportunities && verifyEngData.opportunities.length > 0) {
            console.log(`[PortalTab] Found ${verifyEngData.opportunities.length} engagement opportunities!`);
            setEngagementOpportunities(verifyEngData.opportunities);
          } else {
            setEngagementOpportunities([]);
          }
          
          // Set claimable rewards (actions done but not claimed)
          if (verifyEngData.claimableRewards && verifyEngData.claimableRewards.length > 0) {
            console.log(`[PortalTab] Found ${verifyEngData.claimableRewards.length} claimable rewards! Total: ${verifyEngData.totalClaimableReward}`);
            setClaimableRewards(verifyEngData.claimableRewards);
          } else {
            setClaimableRewards([]);
          }
        }
      } catch (verifyEngErr) {
        console.log("[PortalTab] Error fetching opportunities:", verifyEngErr);
      }
    } catch (err: any) {
      console.error("[PortalTab] Error fetching claim status:", err);
      setError(err.message || "Failed to load claim status");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCreator = async () => {
    if (!userFid || !isCreator) return;

    try {
      setVerifying(true);
      setError(null);
      setSuccess(null);
      triggerHaptic("medium");

      const res = await fetch("/api/portal/creator/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid: userFid }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setSuccess("Creator cast verified successfully!");
      setCreatorClaimStatus(data);
      triggerHaptic("heavy");
      // Refresh status after a moment
      setTimeout(() => fetchClaimStatus(), 1000);
    } catch (err: any) {
      console.error("[PortalTab] Error verifying creator:", err);
      setError(err.message || "Failed to verify creator cast");
      triggerHaptic("rigid");
    } finally {
      setVerifying(false);
    }
  };

  const handleClaimCreator = async () => {
    if (!userFid || !creatorClaimStatus?.isEligible || creatorClaimStatus.hasClaimed) return;

    try {
      setClaiming(true);
      setError(null);
      setSuccess(null);
      triggerHaptic("medium");

      const res = await fetch("/api/portal/creator/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid: userFid }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Claim failed");
      }

      setSuccess(`Successfully claimed ${data.rewardAmount?.toLocaleString()} CATWALK tokens!`);
      setCreatorClaimStatus(data);
      triggerHaptic("heavy");
      setTimeout(() => fetchClaimStatus(), 1000);
    } catch (err: any) {
      console.error("[PortalTab] Error claiming creator reward:", err);
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

  const handleClaimEngagement = async (castHash: string, engagementType: string) => {
    if (!userFid) return;

    try {
      setClaiming(true);
      setError(null);
      setSuccess(null);
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

      // Show success with BaseScan link if available
      const basescanUrl = data.basescanUrl || (data.transactionHash ? `https://basescan.org/tx/${data.transactionHash}` : null);
      if (basescanUrl) {
        setSuccess(`✅ Claimed ${data.rewardAmount?.toLocaleString() || ''} CATWALK! View on BaseScan: ${basescanUrl}`);
      } else {
        setSuccess(`Successfully claimed reward for ${engagementType}!`);
      }
      triggerHaptic("heavy");
      
      // Refresh opportunities and claimable rewards
      setTimeout(async () => {
        await fetchClaimStatus();
        if (userFid) {
          const verifyRes = await fetch("/api/portal/engagement/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fid: userFid }),
          });
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json() as EngagementOpportunitiesResponse;
            setEngagementOpportunities(verifyData.opportunities || []);
            setClaimableRewards(verifyData.claimableRewards || []);
          }
        }
      }, 1000);
    } catch (err: any) {
      console.error("[PortalTab] Error claiming engagement reward:", err);
      setError(err.message || "Failed to claim reward");
      triggerHaptic("rigid");
    } finally {
      setClaiming(false);
    }
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
        Verify your activity and claim rewards
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
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#ffffff" }}>
          <p>Loading claim status...</p>
        </div>
      ) : (
        <>
          {/* Creator Claim Section */}
          {isCreator && (
            <div
              style={{
                background: "#1a1a1a",
                border: "2px solid #c1b400",
                borderRadius: 12,
                padding: "24px",
                marginBottom: 24,
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
                🐱 Creator Reward
              </h2>
              <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
                Verify that you&apos;ve posted to the /catwalk channel and claim 500,000 CATWALK tokens.
              </p>
              <p style={{ color: "#999999", fontSize: 12, marginBottom: 20, lineHeight: 1.4 }}>
                Claims are available for casts posted in the last 30 days. New casts are detected automatically within 5 minutes.
              </p>

              {creatorClaimStatus?.hasClaimed ? (
                <div
                  style={{
                    background: "#000000",
                    border: "2px solid #00ff00",
                    borderRadius: 8,
                    padding: "16px",
                    marginBottom: 16,
                  }}
                >
                  <p style={{ color: "#00ff00", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                    ✅ Reward Claimed
                  </p>
                  <p style={{ color: "#ffffff", fontSize: 14 }}>
                    You&apos;ve already claimed {creatorClaimStatus.rewardAmount?.toLocaleString()} CATWALK tokens.
                  </p>
                  {creatorClaimStatus.transactionHash && (
                    <div style={{ marginTop: 8 }}>
                      <a
                        href={`https://basescan.org/tx/${creatorClaimStatus.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#c1b400",
                          fontSize: 12,
                          textDecoration: "underline",
                          display: "block",
                        }}
                      >
                        View on BaseScan: {creatorClaimStatus.transactionHash.substring(0, 10)}...
                        {creatorClaimStatus.transactionHash.substring(creatorClaimStatus.transactionHash.length - 8)}
                      </a>
                    </div>
                  )}
                </div>
              ) : creatorClaimStatus?.isEligible ? (
                <div
                  style={{
                    background: "#000000",
                    border: "2px solid #c1b400",
                    borderRadius: 8,
                    padding: "16px",
                    marginBottom: 16,
                  }}
                >
                  <p style={{ color: "#c1b400", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                    ✅ Verification Complete
                  </p>
                  <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 16 }}>
                    You&apos;re eligible to claim {creatorClaimStatus.rewardAmount?.toLocaleString()} CATWALK tokens!
                  </p>
                  <button
                    onClick={handleClaimCreator}
                    disabled={claiming}
                    style={{
                      width: "100%",
                      padding: "12px 24px",
                      background: "#c1b400",
                      color: "#000000",
                      border: "2px solid #000000",
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: claiming ? "not-allowed" : "pointer",
                      opacity: claiming ? 0.6 : 1,
                    }}
                  >
                    {claiming ? "Claiming..." : `Claim ${creatorClaimStatus.rewardAmount?.toLocaleString()} CATWALK`}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleVerifyCreator}
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
                  {verifying ? "Verifying..." : "Verify Creator Cast"}
                </button>
              )}
            </div>
          )}

          {/* CLAIM REWARDS SECTION - AT THE TOP */}
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
                💰 CLAIM YOUR REWARDS
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
                            // Use Mini App SDK to open in native client (minimizes mini app)
                            if (actions?.openUrl) {
                              await actions.openUrl(opportunity.castUrl);
                            } else {
                              // Fallback to window.open if SDK not available
                              window.open(opportunity.castUrl, "_blank", "noopener,noreferrer");
                            }
                          } catch (err) {
                            console.error("Error opening cast URL:", err);
                            // Fallback to window.open on error
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
