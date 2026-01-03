"use client";
// Auto-engage feature v2 - deployed Dec 31 2024
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
  const [transactionUrl, setTransactionUrl] = useState<string | null>(null);
  
  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingClaim, setPendingClaim] = useState<{
    castHash: string;
    castUrl: string;
    actionTypes: string[];
    totalReward: number;
    missedReward: number;
    missingActions: string[];
  } | null>(null);
  
  // Auto-engage preferences state
  const [autoEngageEnabled, setAutoEngageEnabled] = useState(false);
  const [signerUuid, setSignerUuid] = useState<string | null>(null);
  const [bonusMultiplier, setBonusMultiplier] = useState(1.0);
  const [bulkEngaging, setBulkEngaging] = useState(false);
  const [enablingAutoEngage, setEnablingAutoEngage] = useState(false);
  const [signerApprovalUrl, setSignerApprovalUrl] = useState<string | null>(null);
  const [pollingSigner, setPollingSigner] = useState(false);
  
  // Lifetime earnings state (uses sections from API)
  const [lifetimeRewards, setLifetimeRewards] = useState<{ creator: { amount: number; count: number }; patron: { amount: number; count: number; likes: { amount: number; count: number }; recasts: { amount: number; count: number }; comments: { amount: number; count: number } }; virtualWalk: { amount: number; count: number }; total: number } | null>(null);
  const [lifetimePeriod, setLifetimePeriod] = useState<"7d" | "30d" | "1y" | "lifetime">("lifetime");
  const [loadingLifetime, setLoadingLifetime] = useState(false);


  const isCreator = userFid && CATWALK_CREATOR_FIDS.includes(userFid);

  // Fetch claim status on mount and auto-poll every 5 minutes
  useEffect(() => {
    if (userFid) {
      fetchClaimStatus();
      fetchAutoEngagePrefs();
      fetchLifetimeRewards();
      
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

  // Fetch lifetime rewards data
  const fetchLifetimeRewards = async (period: string = lifetimePeriod) => {
    if (!userFid) return;
    try {
      setLoadingLifetime(true);
      const res = await fetch(`/api/portal/lifetime-rewards?fid=${userFid}&period=${period}`);
      if (res.ok) {
        const data = await res.json();
        if (data.sections) { setLifetimeRewards(data.sections); }
      }
    } catch (err) {
      console.log("[PortalTab] Error fetching lifetime rewards:", err);
    } finally {
      setLoadingLifetime(false);
    }
  };

  // Handle period change
  const handlePeriodChange = (newPeriod: "7d" | "30d" | "1y" | "lifetime") => {
    setLifetimePeriod(newPeriod);
    fetchLifetimeRewards(newPeriod);
  };

  // Fetch auto-engage preferences and verify signer status
  const fetchAutoEngagePrefs = async () => {
    if (!userFid) return;
    try {
      const res = await fetch(`/api/portal/engage/preferences?fid=${userFid}`);
      if (res.ok) {
        const data = await res.json();
        setBonusMultiplier(data.bonusMultiplier || 1.0);
        
        // If there's a stored signer, check if it's actually approved
        if (data.signerUuid) {
          try {
            const signerRes = await fetch(`/api/auth/signer?signerUuid=${data.signerUuid}`);
            if (signerRes.ok) {
              const signerData = await signerRes.json();
              console.log("[PortalTab] Signer status:", signerData.status);
              
              if (signerData.status === "approved") {
                setSignerUuid(data.signerUuid);
                setAutoEngageEnabled(data.autoEngageEnabled || false);
                setSignerApprovalUrl(null);
              } else {
                console.log("[PortalTab] Signer needs approval");
                setSignerUuid(null);
                setAutoEngageEnabled(false);
                // Signer not approved - show authorization button
                // Set a placeholder to trigger the UI
                setSignerApprovalUrl("pending");
              }
            } else {
              setSignerUuid(null);
              setAutoEngageEnabled(false);
            }
          } catch (err) {
            console.log("[PortalTab] Signer check error:", err);
            setSignerUuid(null);
            setAutoEngageEnabled(false);
          }
        } else {
          setSignerUuid(null);
          setAutoEngageEnabled(false);
        }
      }
    } catch (err) {
      console.log("[PortalTab] Error fetching auto-engage prefs:", err);
    }
  };

  // Start the signer authorization flow
  const handleEnableAutoEngage = async () => {
    if (!userFid) return;
    
    try {
      setEnablingAutoEngage(true);
      setError(null);
      triggerHaptic("medium");

      console.log("[PortalTab] Calling authorize endpoint for FID:", userFid);
      
      // Call the new authorize endpoint with EIP-712 signing
      const authRes = await fetch("/api/portal/engage/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid: userFid }),
      });
      
      const authData = await authRes.json();
      
      if (!authRes.ok) {
        throw new Error(authData.error || "Failed to authorize signer");
      }
      console.log("[PortalTab] Authorize response:", authData);

      // The signer response contains signer_uuid and signer_approval_url
      const newSignerUuid = authData.signerUuid;
      const approvalUrl = authData.approvalUrl;

      if (!newSignerUuid) {
        throw new Error("No signer UUID received");
      }

      // The authorize endpoint already saved the signer data to DB
      
      if (authData.needsApproval && approvalUrl) {
        setSignerApprovalUrl(approvalUrl);
        // Open the approval URL in Warpcast
        if (actions?.openUrl) {
          actions.openUrl(approvalUrl);
        }
        
        // Start polling for approval
        setPollingSigner(true);
        pollSignerStatus(newSignerUuid);
      } else if (!authData.needsApproval) {
        // Already approved
        setSignerUuid(newSignerUuid);
        setAutoEngageEnabled(true);
        setBonusMultiplier(1.1);
        
        // Enable auto-engage
        await fetch("/api/portal/engage/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fid: userFid,
            signerUuid: newSignerUuid,
            autoEngageEnabled: true,
          }),
        });
        
        setSuccess("Auto-engage enabled! You now earn 10% bonus on all rewards.");
        triggerHaptic("heavy");
      } else {
        throw new Error("No approval URL received from server");
      }
    } catch (err: any) {
      console.error("[PortalTab] Enable auto-engage error:", err);
      setError(err.message || "Failed to enable auto-engage");
      triggerHaptic("rigid");
    } finally {
      setEnablingAutoEngage(false);
    }
  };

  // Poll for signer approval status
  const pollSignerStatus = async (pendingSignerUuid: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5 second intervals

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/auth/signer?signerUuid=${pendingSignerUuid}`);
        if (!res.ok) {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkStatus, 5000);
          } else {
            setPollingSigner(false);
            setError("Signer approval timed out. Please try again.");
          }
          return;
        }

        const data = await res.json();
        console.log("[PortalTab] Signer status:", data);

        // Check if approved (status will be "approved" once user approves in Warpcast)
        if (data.status === "approved") {
          setPollingSigner(false);
          setSignerApprovalUrl(null);
          setSignerUuid(pendingSignerUuid);
          setAutoEngageEnabled(true);
          setBonusMultiplier(1.1);

          // Update preferences
          await fetch("/api/portal/engage/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fid: userFid,
              signerUuid: pendingSignerUuid,
              autoEngageEnabled: true,
            }),
          });

          setSuccess("Auto-engage enabled! You now earn 10% bonus on all rewards.");
          triggerHaptic("heavy");
        } else if (data.status === "pending_approval") {
          // Still pending, keep polling
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkStatus, 5000);
          } else {
            setPollingSigner(false);
            setError("Signer approval timed out. Please try again.");
          }
        } else {
          // Unknown status
          setPollingSigner(false);
          setError(`Unexpected signer status: ${data.status}`);
        }
      } catch (err) {
        console.error("[PortalTab] Poll signer error:", err);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000);
        } else {
          setPollingSigner(false);
          setError("Failed to check signer status");
        }
      }
    };

    checkStatus();
  };

  // Handle bulk like & recast all
  const handleBulkEngage = async () => {
    if (!userFid || !signerUuid) {
      setError("Please enable auto-engage to use this feature");
      return;
    }

    // Get all casts that have missing likes or recasts
    const castsToEngage: { hash: string; missingActions: string[] }[] = [];
    
    for (const opportunity of engagementOpportunities) {
      const missingActions = opportunity.availableActions
        .filter(a => a.type === "like" || a.type === "recast")
        .map(a => a.type);
      if (missingActions.length > 0) {
        castsToEngage.push({ hash: opportunity.castHash, missingActions });
      }
    }

    if (castsToEngage.length === 0) {
      setSuccess("No casts need likes or recasts!");
      return;
    }

    try {
      setBulkEngaging(true);
      setError(null);
      triggerHaptic("medium");

      const res = await fetch("/api/portal/engage/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: userFid,
          signerUuid,
          castHashes: castsToEngage.map(c => c.hash),
          actions: ["like", "recast"],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.needsApproval && data.approvalUrl) {
          setSignerApprovalUrl(data.approvalUrl);
          setSignerUuid(null);
          setAutoEngageEnabled(false);
          if (actions && actions.openUrl) {
            actions.openUrl(data.approvalUrl);
          }
          throw new Error("Signer needs approval. Opening Warpcast...");
        }
        throw new Error(data.error || "Bulk engage failed");
      }

      setSuccess(`Liked & recasted ${data.summary.successful} casts! Refresh to claim rewards.`);
      triggerHaptic("heavy");
      
      // Refresh opportunities after a moment
      setTimeout(() => fetchClaimStatus(), 2000);
    } catch (err: any) {
      console.error("[PortalTab] Bulk engage error:", err);
      setError(err.message || "Failed to bulk engage");
      triggerHaptic("rigid");
    } finally {
      setBulkEngaging(false);
    }
  };

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
      triggerHaptic("heavy");
      // Refresh status to get properly formatted data
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

  const handleClaimAllEngagements = async (castHash: string, engagementTypes: string[]) => {
    if (!userFid) return;

    try {
      setClaiming(true);
      setError(null);
      setSuccess(null);
      triggerHaptic("medium");

      const res = await fetch("/api/portal/engagement/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid: userFid, castHash, engagementTypes }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Claim failed");
      }

      // Show success with BaseScan link if available
      const basescanUrl = data.basescanUrl || (data.transactionHash ? `https://basescan.org/tx/${data.transactionHash}` : null);
      if (basescanUrl) {
        setSuccess(`Claimed ${data.rewardAmount?.toLocaleString() || ''} CATWALK for ${data.claimedCount || engagementTypes.length} action(s)!`);
        setTransactionUrl(basescanUrl);
      } else {
        setSuccess(`Successfully claimed ${engagementTypes.length} reward(s)!`);
        setTransactionUrl(null);
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
          fontSize: 22,
          fontWeight: 900,
          marginBottom: 8,
          textAlign: "center",
          background: "rgba(0, 0, 0, 0.85)",
          padding: "12px 16px",
          borderRadius: 8,
        }}
      >
        Creator Portal
      </h1>
      <p
        style={{
          color: "#ffffff",
          fontSize: 13,
          textAlign: "center",
          marginBottom: 16,
          background: "rgba(0, 0, 0, 0.75)",
          padding: "8px 12px",
          borderRadius: 6,
        }}
      >
        Earn CATWALK for posting and engaging in /catwalk
      </p>

      {/* Lifetime Earnings Section */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(193, 180, 0, 0.15) 0%, rgba(0, 0, 0, 0.9) 100%)",
          border: "2px solid #c1b400",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ color: "#c1b400", fontSize: 16, fontWeight: 700, margin: 0 }}>
            Lifetime Earned
          </h3>
          <select
            value={lifetimePeriod}
            onChange={(e) => handlePeriodChange(e.target.value as "7d" | "30d" | "1y" | "lifetime")}
            style={{
              background: "#000",
              color: "#c1b400",
              border: "1px solid #c1b400",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="1y">Last Year</option>
            <option value="lifetime">All Time</option>
          </select>
        </div>

        {loadingLifetime ? (
          <p style={{ color: "#888", fontSize: 12, textAlign: "center" }}>Loading...</p>
        ) : lifetimeRewards ? (
          <>
            {/* Total */}
            <div style={{ textAlign: "center", marginBottom: 16, padding: 12, background: "rgba(193, 180, 0, 0.2)", borderRadius: 8 }}>
              <div style={{ color: "#c1b400", fontSize: 28, fontWeight: 900 }}>
                {(lifetimeRewards.total || 0).toLocaleString()}
              </div>
              <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>TOTAL $CATWALK CLAIMED</div>
            </div>
            {/* 3 Category Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Creator Rewards */}
              <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", padding: 12, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#22c55e", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>CREATOR REWARDS</div>
                    <div style={{ color: "#888", fontSize: 10 }}>Posting in /catwalk</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#22c55e", fontSize: 18, fontWeight: 700 }}>{(lifetimeRewards.creator?.amount || 0).toLocaleString()}</div>
                    <div style={{ color: "#666", fontSize: 10 }}>{lifetimeRewards.creator?.count || 0} posts</div>
                  </div>
                </div>
              </div>
              {/* Patron Rewards */}
              <div style={{ background: "rgba(168, 85, 247, 0.1)", border: "1px solid #a855f7", padding: 12, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ color: "#a855f7", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>PATRON REWARDS</div>
                    <div style={{ color: "#888", fontSize: 10 }}>Likes, recasts and comments</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#a855f7", fontSize: 18, fontWeight: 700 }}>{(lifetimeRewards.patron?.amount || 0).toLocaleString()}</div>
                    <div style={{ color: "#666", fontSize: 10 }}>{lifetimeRewards.patron?.count || 0} actions</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: "1px solid rgba(168, 85, 247, 0.3)" }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600 }}>{(lifetimeRewards.patron?.likes?.amount || 0).toLocaleString()}</div>
                    <div style={{ color: "#666", fontSize: 9 }}>Likes ({lifetimeRewards.patron?.likes?.count || 0})</div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ color: "#3b82f6", fontSize: 12, fontWeight: 600 }}>{(lifetimeRewards.patron?.recasts?.amount || 0).toLocaleString()}</div>
                    <div style={{ color: "#666", fontSize: 9 }}>Recasts ({lifetimeRewards.patron?.recasts?.count || 0})</div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ color: "#f59e0b", fontSize: 12, fontWeight: 600 }}>{(lifetimeRewards.patron?.comments?.amount || 0).toLocaleString()}</div>
                    <div style={{ color: "#666", fontSize: 9 }}>Comments ({lifetimeRewards.patron?.comments?.count || 0})</div>
                  </div>
                </div>
              </div>
              {/* Virtual Walk Rewards */}
              <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid #3b82f6", padding: 12, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#3b82f6", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>VIRTUAL WALK REWARDS</div>
                    <div style={{ color: "#888", fontSize: 10 }}>Daily cat walks</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#3b82f6", fontSize: 18, fontWeight: 700 }}>{(lifetimeRewards.virtualWalk?.amount || 0).toLocaleString()}</div>
                    <div style={{ color: "#666", fontSize: 10 }}>{lifetimeRewards.virtualWalk?.count || 0} walks</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: "#888", fontSize: 12, textAlign: "center" }}>No rewards claimed yet</p>
        )}
      </div>

      {/* Confirmation Modal for Incomplete Claims */}
      {showConfirmModal && pendingClaim && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => {
            setShowConfirmModal(false);
            setPendingClaim(null);
          }}
        >
          <div
            style={{
              background: "#1a1a1a",
              border: "3px solid #ffaa00",
              borderRadius: 12,
              padding: 24,
              maxWidth: 340,
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: "#ffaa00", fontSize: 20, fontWeight: 700, marginBottom: 16, textAlign: "center" }}>
              Incomplete Actions
            </h3>
            
            <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
              You haven&apos;t completed all actions for this cast:
            </p>
            
            <div style={{ marginBottom: 16, padding: 12, background: "#000", borderRadius: 8, border: "1px solid #ff4444" }}>
              {pendingClaim.missingActions.map((action) => (
                <button
                  key={action}
                  onClick={async () => {
                    triggerHaptic("light");
                    setShowConfirmModal(false);
                    setPendingClaim(null);
                    // Open the cast in Warpcast so user can complete the action
                    try {
                      if (actions?.openUrl) {
                        await actions.openUrl(pendingClaim.castUrl);
                      } else {
                        window.open(pendingClaim.castUrl, "_blank", "noopener,noreferrer");
                      }
                    } catch (err) {
                      console.error("Error opening cast URL:", err);
                      window.open(pendingClaim.castUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    width: "100%",
                    padding: "10px 12px",
                    background: "#1a0a0a",
                    border: "1px solid #ff4444",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: "#ff4444", fontSize: 16 }}>X</span>
                  <span style={{ color: "#ff4444", fontSize: 14, textTransform: "capitalize" }}>
                    {action === "like" && "Like"}
                    {action === "recast" && "Recast"}
                    {action === "comment" && "Comment"}
                  </span>
                  <span style={{ color: "#ff4444", fontSize: 12, marginLeft: "auto" }}>
                    -{action === "like" ? "1,000" : action === "recast" ? "2,000" : "5,000"}
                  </span>
                  <span style={{ color: "#ffaa00", fontSize: 11, fontWeight: 600 }}>
                    TAP TO DO
                  </span>
                </button>
              ))}
            </div>
            
            <p style={{ color: "#ff9500", fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 20 }}>
              You&apos;ll miss out on {pendingClaim.missedReward.toLocaleString()} CATWALK!
            </p>
            
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingClaim(null);
                }}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  background: "transparent",
                  color: "#ffffff",
                  border: "2px solid #666",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  handleClaimAllEngagements(pendingClaim.castHash, pendingClaim.actionTypes);
                  setPendingClaim(null);
                }}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  background: "#ffaa00",
                  color: "#000000",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Claim {pendingClaim.totalReward.toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    // Use Mini App SDK to open URL (works better in Farcaster client)
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
                  textDecoration: "none",
                }}
              >
                View Transaction on BaseScan
              </button>
            </div>
          )}
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
                Creator Reward
              </h2>
              <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
                Verify that you&apos;ve posted to the /catwalk channel and claim 1,000,000 CATWALK tokens.
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
                    Reward Claimed
                  </p>
                  <p style={{ color: "#ffffff", fontSize: 14, marginBottom: 12 }}>
                    You&apos;ve already claimed {creatorClaimStatus.rewardAmount?.toLocaleString()} CATWALK tokens.
                  </p>
                  {creatorClaimStatus.transactionHash && (
                    <a
                      href={`https://basescan.org/tx/${creatorClaimStatus.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#c1b400",
                        fontSize: 12,
                        textDecoration: "underline",
                        display: "block",
                        marginBottom: 12,
                      }}
                    >
                      View on BaseScan: {creatorClaimStatus.transactionHash.substring(0, 10)}...
                      {creatorClaimStatus.transactionHash.substring(creatorClaimStatus.transactionHash.length - 8)}
                    </a>
                  )}
                  <div style={{ borderTop: "1px solid #333", paddingTop: 12, marginTop: 8 }}>
                    <p style={{ color: "#888", fontSize: 13, marginBottom: 8 }}>
                      Cast again to earn more rewards!
                    </p>
                    <a
                      href="https://farcaster.xyz/~/channel/catwalk"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (actions?.openUrl) {
                          actions.openUrl("https://warpcast.com/~/channel/catwalk");
                        }
                      }}
                      style={{
                        display: "inline-block",
                        padding: "8px 16px",
                        background: "#c1b400",
                        color: "#000",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      Cast into /catwalk
                    </a>
                  </div>
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
                    Verification Complete
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
                <div>
                  <div style={{ 
                    background: "rgba(193, 180, 0, 0.1)", 
                    border: "1px solid rgba(193, 180, 0, 0.3)",
                    borderRadius: 8, 
                    padding: 12, 
                    marginBottom: 12,
                    textAlign: "center"
                  }}>
                    <p style={{ color: "#c1b400", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                      No recent casts found
                    </p>
                    <p style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>
                      Cast into /catwalk to earn 1,000,000 CATWALK tokens per post!
                    </p>
                    <a
                      href="https://farcaster.xyz/~/channel/catwalk"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (actions?.openUrl) {
                          actions.openUrl("https://warpcast.com/~/channel/catwalk");
                        }
                      }}
                      style={{
                        display: "inline-block",
                        padding: "10px 20px",
                        background: "#c1b400",
                        color: "#000",
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Cast into /catwalk
                    </a>
                  </div>
                  <button
                    onClick={handleVerifyCreator}
                    disabled={verifying}
                    style={{
                      width: "100%",
                      padding: "10px 24px",
                      background: "transparent",
                      color: "#c1b400",
                      border: "1px solid #c1b400",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: verifying ? "not-allowed" : "pointer",
                      opacity: verifying ? 0.6 : 1,
                    }}
                  >
                    {verifying ? "Verifying..." : "Already posted? Verify now"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CLAIM REWARDS SECTION - AT THE TOP */}
          {claimableRewards.length > 0 && (
            <div
              style={{
                background: "#0a1a0a",
                border: "2px solid #00ff00",
                borderRadius: 10,
                padding: "16px",
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  color: "#00ff00",
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                ENGAGEMENT REWARDS
              </h2>
              <p style={{ color: "#ffffff", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
                You&apos;ve completed these actions! Click &quot;Claim&quot; to receive your CATWALK tokens.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "400px", overflowY: "auto" }}>
                {claimableRewards.map((reward) => {
                  const totalReward = reward.claimableActions.reduce((sum, a) => sum + a.rewardAmount, 0);
                  const actionTypes = reward.claimableActions.map(a => a.type);
                  
                  // All possible actions with their rewards
                  const allActions = [
                    { type: "like" as const, emoji: "L", reward: 1000 },
                    { type: "recast" as const, emoji: "R", reward: 2000 },
                    { type: "comment" as const, emoji: "C", reward: 5000 },
                  ];
                  
                  // Use allDoneActions (includes already-claimed) to correctly identify what's missing
                  const allDoneActions = reward.allDoneActions || [];
                  const missingActions = allActions.filter(a => !allDoneActions.includes(a.type));
                  const missedReward = missingActions.reduce((sum, a) => sum + a.reward, 0);
                  const hasMissingActions = missingActions.length > 0;
                  
                  const handleClaimClick = () => {
                    if (hasMissingActions) {
                      // Show custom confirmation modal
                      setPendingClaim({
                        castHash: reward.castHash,
                        castUrl: reward.castUrl,
                        actionTypes,
                        totalReward,
                        missedReward,
                        missingActions: missingActions.map(a => a.type),
                      });
                      setShowConfirmModal(true);
                      triggerHaptic("rigid");
                      return;
                    }
                    handleClaimAllEngagements(reward.castHash, actionTypes);
                  };
                  
                  return (
                    <div
                      key={reward.castHash}
                      style={{
                        background: "#000000",
                        border: hasMissingActions ? "2px solid #ffaa00" : "2px solid #00ff00",
                        borderRadius: 8,
                        padding: "12px",
                      }}
                    >
                      <div style={{ marginBottom: 8 }}>
                        <p style={{ color: "#ffffff", fontSize: 13, fontWeight: 600, margin: "0 0 2px 0" }}>
                          {reward.authorDisplayName || reward.authorUsername || "Unknown"}
                        </p>
                        {reward.text && (
                          <p style={{ color: "#999999", fontSize: 11, margin: "0 0 6px 0", lineHeight: 1.3 }}>
                            {reward.text}
                          </p>
                        )}
                      </div>
                      
                      {/* Compact action summary with single CLAIM button */}
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        background: "#0a2a0a",
                        borderRadius: 6,
                        border: hasMissingActions ? "1px solid #ffaa00" : "1px solid #00ff00",
                      }}>
                          {allActions.map((action) => {
                            const allDoneActions = reward.allDoneActions || [];
                            const isCompleted = allDoneActions.includes(action.type);
                            return (
                              <div key={action.type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 14 }}>{action.emoji}</span>
                                <span style={{ color: isCompleted ? "#00ff00" : "#ff4444", fontSize: 11 }}>
                                  {isCompleted ? "OK" : "X"}
                                </span>
                              </div>
                            );
                          })}
                          <span style={{ color: "#ff9500", fontSize: 13, fontWeight: 700, marginLeft: 8 }}>
                            +{totalReward.toLocaleString()}
                          </span>
                        </div>
                        <button
                          onClick={handleClaimClick}
                          disabled={claiming}
                          style={{
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: claiming ? "not-allowed" : "pointer",
                            opacity: claiming ? 0.6 : 1,
                          }}
                        >
                          {claiming ? "..." : "CLAIM"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-Engage Section */}
          <div
            style={{
              background: "#1a0a1a",
              border: "2px solid #ff00ff",
              borderRadius: 12,
              padding: "20px",
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2
                style={{
                  color: "#ff00ff",
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                Quick Actions
              </h2>
              {bonusMultiplier > 1 && (
                <span style={{
                  background: "#ff00ff",
                  color: "#000",
                  padding: "4px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  +10% BONUS
                </span>
              )}
            </div>
            
            {/* Like & Recast All Button */}
            <button
              onClick={handleBulkEngage}
              disabled={bulkEngaging || !signerUuid || engagementOpportunities.length === 0}
              style={{
                width: "100%",
                padding: "14px 20px",
                background: signerUuid ? "#ff00ff" : "#333",
                color: signerUuid ? "#000" : "#666",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 700,
                cursor: (bulkEngaging || !signerUuid || engagementOpportunities.length === 0) ? "not-allowed" : "pointer",
                opacity: bulkEngaging ? 0.6 : 1,
                marginBottom: 16,
              }}
            >
              {bulkEngaging ? "Liking & Recasting..." : signerUuid ? "Like & Recast All Casts" : "Enable Auto-Engage First"}
            </button>

            {/* Signer Authorization Required */}
            {signerApprovalUrl && !signerUuid && (
              <div style={{
                background: "#2a1500",
                border: "2px solid #ff6600",
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}>
                <h3 style={{ color: "#ff6600", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                  ???? Authorization Required
                </h3>
                <p style={{ color: "#ccc", fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                  To use auto-engage and bulk like/recast features, you need to authorize this app in Warpcast.
                  This is a one-time setup that allows the app to like and recast on your behalf.
                </p>
                <button
                  onClick={async () => {
                    try {
                      setEnablingAutoEngage(true);
                      setError(null);
                      console.log("[PortalTab] Requesting signer authorization...");
                      
                      // Call the authorize endpoint to get a fresh signer with approval URL
                      const res = await fetch("/api/portal/engage/authorize", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fid: userFid }),
                      });
                      
                      const data = await res.json();
                      console.log("[PortalTab] Authorization response:", data);
                      
                      if (!res.ok) {
                        throw new Error(data.error || "Authorization failed");
                      }
                      
                      if (data.needsApproval && data.approvalUrl) {
                        setSignerApprovalUrl(data.approvalUrl);
                        if (actions && actions.openUrl) {
                          console.log("[PortalTab] Opening Warpcast approval URL");
                          actions.openUrl(data.approvalUrl);
                        }
                        setPollingSigner(true);
                        // Start polling for approval
                        if (data.signerUuid) {
                          pollSignerStatus(data.signerUuid);
                        }
                      } else if (!data.needsApproval) {
                        // Already approved
                        setSignerUuid(data.signerUuid);
                        setAutoEngageEnabled(true);
                        setBonusMultiplier(1.1);
                        setSuccess("Signer is already approved!");
                      }
                    } catch (err: any) {
                      console.error("[PortalTab] Auth error:", err);
                      setError(err?.message || "Authorization failed");
                    } finally {
                      setEnablingAutoEngage(false);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "14px 20px",
                    background: "#ff6600",
                    color: "#000",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ???? Authorize in Warpcast
                </button>
                <p style={{ color: "#888", fontSize: 11, marginTop: 8, textAlign: "center" }}>
                  After authorizing, return here and the features will be enabled automatically.
                </p>
              </div>
            )}

            {/* Auto-Engage Toggle */}
            <div style={{
              background: "#0a0a0a",
              border: `1px solid ${autoEngageEnabled ? "#00ff00" : "#ff00ff"}`,
              borderRadius: 8,
              padding: "12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p style={{ color: autoEngageEnabled ? "#00ff00" : "#ff00ff", fontSize: 14, fontWeight: 600, margin: 0 }}>
                  {autoEngageEnabled ? "Auto-Engage Active" : "Auto Like & Recast"}
                </p>
                {autoEngageEnabled && (
                  <span style={{
                    background: "#00ff00",
                    color: "#000",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                  }}>
                    +10% BONUS
                  </span>
                )}
              </div>
              
              <p style={{ color: "#999", fontSize: 12, lineHeight: 1.4, marginBottom: 12 }}>
                {autoEngageEnabled 
                  ? "Your account will automatically like & recast new casts in /catwalk within 5 minutes. You're earning 10% bonus on all rewards!"
                  : "Enable auto-engagement to automatically like & recast new casts in /catwalk within 5 minutes of posting."
                }
              </p>
              
              {!autoEngageEnabled && (
                <p style={{ color: "#ff00ff", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
                  Earn 10% bonus CATWALK on all rewards when enabled!
                </p>
              )}
              
              {pollingSigner && (
                <div style={{
                  background: "#1a1a00",
                  border: "1px solid #c1b400",
                  borderRadius: 6,
                  padding: "10px",
                  marginBottom: 12,
                }}>
                  <p style={{ color: "#c1b400", fontSize: 12, fontWeight: 600 }}>
                    Waiting for approval in Warpcast...
                  </p>
                  <p style={{ color: "#999", fontSize: 11, marginTop: 4 }}>
                    Please approve the signer request in Warpcast to enable auto-engage.
                  </p>
                  {signerApprovalUrl && (
                    <button
                      onClick={() => actions?.openUrl && actions.openUrl(signerApprovalUrl)}
                      style={{
                        marginTop: 8,
                        padding: "6px 12px",
                        background: "#c1b400",
                        color: "#000",
                        border: "none",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Open Approval Page
                    </button>
                  )}
                </div>
              )}
              
              {!signerUuid && !pollingSigner && (
                <button
                  onClick={handleEnableAutoEngage}
                  disabled={enablingAutoEngage}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: enablingAutoEngage ? "#333" : "#ff00ff",
                    color: enablingAutoEngage ? "#666" : "#000",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: enablingAutoEngage ? "not-allowed" : "pointer",
                    opacity: enablingAutoEngage ? 0.6 : 1,
                  }}
                >
                  {enablingAutoEngage ? "Setting up..." : "Enable Auto-Engage (+10% Bonus)"}
                </button>
              )}
              
              {signerUuid && !autoEngageEnabled && (
                <button
                  onClick={async () => {
                    try {
                      await fetch("/api/portal/engage/preferences", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          fid: userFid,
                          autoEngageEnabled: true,
                        }),
                      });
                      setAutoEngageEnabled(true);
                      setBonusMultiplier(1.1);
                      setSuccess("Auto-engage enabled!");
                      triggerHaptic("medium");
                    } catch {
                      setError("Failed to enable auto-engage");
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: "#ff00ff",
                    color: "#000",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Enable Auto-Engage (+10% Bonus)
                </button>
              )}
              
              {autoEngageEnabled && (
                <button
                  onClick={async () => {
                    try {
                      await fetch("/api/portal/engage/preferences", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          fid: userFid,
                          autoEngageEnabled: false,
                        }),
                      });
                      setAutoEngageEnabled(false);
                      setBonusMultiplier(1.0);
                      setSuccess("Auto-engage disabled");
                      triggerHaptic("light");
                    } catch {
                      setError("Failed to disable auto-engage");
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 16px",
                    background: "transparent",
                    color: "#666",
                    border: "1px solid #333",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Disable Auto-Engage
                </button>
              )}
            </div>
          </div>

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
              Engagement Opportunities
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
                      
                      {/* Compact horizontal action status */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        background: "#1a1a1a",
                        borderRadius: 6,
                        marginBottom: 12,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          {/* Like */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span>L</span>
                            <span style={{ color: opportunity.availableActions.some(a => a.type === "like") ? "#ff4444" : "#00ff00", fontWeight: 600 }}>
                              {opportunity.availableActions.some(a => a.type === "like") ? "X" : "OK"}
                            </span>
                          </div>
                          {/* Recast */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span>R</span>
                            <span style={{ color: opportunity.availableActions.some(a => a.type === "recast") ? "#ff4444" : "#00ff00", fontWeight: 600 }}>
                              {opportunity.availableActions.some(a => a.type === "recast") ? "X" : "OK"}
                            </span>
                          </div>
                          {/* Comment */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span>C</span>
                            <span style={{ color: opportunity.availableActions.some(a => a.type === "comment") ? "#ff4444" : "#00ff00", fontWeight: 600 }}>
                              {opportunity.availableActions.some(a => a.type === "comment") ? "X" : "OK"}
                            </span>
                          </div>
                        </div>
                        <span style={{ color: "#c1b400", fontSize: 13, fontWeight: 600 }}>
                          +{opportunity.availableActions.reduce((sum, a) => sum + a.rewardAmount, 0).toLocaleString()} CATWALK
                        </span>
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
