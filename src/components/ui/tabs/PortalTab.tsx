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

export function PortalTab() {
  const { context } = useMiniApp();
  const { triggerHaptic } = useHapticFeedback();
  const userFid = context?.user?.fid;

  const [creatorClaimStatus, setCreatorClaimStatus] = useState<CreatorClaimStatus | null>(null);
  const [engagementClaimStatus, setEngagementClaimStatus] = useState<EngagementClaimStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isCreator = userFid && CATWALK_CREATOR_FIDS.includes(userFid);

  // Fetch claim status on mount
  useEffect(() => {
    if (userFid) {
      fetchClaimStatus();
    } else {
      setLoading(false);
    }
  }, [userFid]);

  const fetchClaimStatus = async () => {
    if (!userFid) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/portal/status?fid=${userFid}`);
      if (!res.ok) {
        throw new Error("Failed to fetch claim status");
      }

      const data = await res.json();
      setCreatorClaimStatus(data.creator || null);
      setEngagementClaimStatus(data.engagement || null);
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setSuccess(`Found ${data.eligibleCount} eligible engagement(s)!`);
      setEngagementClaimStatus(data);
      triggerHaptic("heavy");
      setTimeout(() => fetchClaimStatus(), 1000);
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

      setSuccess(`Successfully claimed reward for ${engagementType}!`);
      triggerHaptic("heavy");
      setTimeout(() => fetchClaimStatus(), 1000);
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
              <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
                Verify that you've posted to the /catwalk channel and claim 500,000 CATWALK tokens.
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
                    You've already claimed {creatorClaimStatus.rewardAmount?.toLocaleString()} CATWALK tokens.
                  </p>
                  {creatorClaimStatus.transactionHash && (
                    <p style={{ color: "#999999", fontSize: 12, marginTop: 8 }}>
                      TX: {creatorClaimStatus.transactionHash.substring(0, 20)}...
                    </p>
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
                    You're eligible to claim {creatorClaimStatus.rewardAmount?.toLocaleString()} CATWALK tokens!
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

          {/* Engagement Claim Section */}
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
              💬 Engagement Rewards
            </h2>
            <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
              Like, comment, or recast posts in the /catwalk channel to earn rewards. Verify your engagement to claim.
            </p>

            {engagementClaimStatus ? (
              <>
                {engagementClaimStatus.eligibleCount > 0 ? (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 12 }}>
                      <strong>{engagementClaimStatus.eligibleCount}</strong> eligible engagement(s) found
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {engagementClaimStatus.claims
                        .filter((claim) => !claim.claimed)
                        .map((claim, idx) => (
                          <div
                            key={`${claim.castHash}-${claim.engagementType}`}
                            style={{
                              background: "#000000",
                              border: "1px solid #c1b400",
                              borderRadius: 8,
                              padding: "12px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <p style={{ color: "#ffffff", fontSize: 14, fontWeight: 600, margin: 0 }}>
                                {claim.engagementType === "like" && "❤️ Like"}
                                {claim.engagementType === "comment" && "💬 Comment"}
                                {claim.engagementType === "recast" && "🔁 Recast"}
                              </p>
                              <p
                                style={{
                                  color: "#999999",
                                  fontSize: 12,
                                  margin: "4px 0 0 0",
                                  fontFamily: "monospace",
                                }}
                              >
                                {claim.castHash.substring(0, 16)}...
                              </p>
                            </div>
                            <button
                              onClick={() => handleClaimEngagement(claim.castHash, claim.engagementType)}
                              disabled={claiming}
                              style={{
                                padding: "8px 16px",
                                background: "#c1b400",
                                color: "#000000",
                                border: "none",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: claiming ? "not-allowed" : "pointer",
                                opacity: claiming ? 0.6 : 1,
                              }}
                            >
                              Claim
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
                    {verifying ? "Verifying..." : "Verify Engagement"}
                  </button>
                )}

                {engagementClaimStatus.claimedCount > 0 && (
                  <div
                    style={{
                      background: "#000000",
                      border: "2px solid #00ff00",
                      borderRadius: 8,
                      padding: "12px",
                      marginTop: 16,
                    }}
                  >
                    <p style={{ color: "#00ff00", fontSize: 14, fontWeight: 700, margin: 0 }}>
                      ✅ {engagementClaimStatus.claimedCount} reward(s) claimed
                    </p>
                  </div>
                )}
              </>
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
                {verifying ? "Verifying..." : "Verify Engagement"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
