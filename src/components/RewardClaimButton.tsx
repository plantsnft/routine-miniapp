"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useConnect, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { useHapticFeedback } from "~/hooks/useHapticFeedback";
import { config } from "~/components/providers/WagmiProvider";

interface RewardClaimButtonProps {
  fid: number;
  checkedIn: boolean;
}

/**
 * Reward claim button component.
 * Shows a yellow thin bar below the streak info when reward is available.
 */
export function RewardClaimButton({ fid, checkedIn }: RewardClaimButtonProps) {
  const { triggerHaptic } = useHapticFeedback();
  const { isConnected, chainId } = useAccount();
  const { connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  
  const [canClaim, setCanClaim] = useState(false);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  
  // Wagmi hooks for transaction
  const {
    sendTransaction,
    error: txError,
    isError: isTxError,
    isPending: isTxPending,
  } = useSendTransaction();
  
  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });
  
  // Check if reward is available
  useEffect(() => {
    if (!checkedIn || !fid) {
      setCanClaim(false);
      setLoading(false);
      return;
    }
    
    const checkRewardStatus = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/checkin/reward?fid=${fid}`);
        if (res.ok) {
          const data = await res.json();
          setCanClaim(data.canClaim || false);
          // Reset success state if reward becomes available again (new day)
          if (data.canClaim) {
            setSuccess(false);
            setTxHash(null);
            setError(null);
          }
        }
      } catch (error) {
        console.error("[RewardClaimButton] Error checking reward status:", error);
      } finally {
        setLoading(false);
      }
    };
    
    // Check immediately when checkedIn changes
    checkRewardStatus();
    
    // Refresh every 30 seconds to check if reward becomes available
    const interval = setInterval(checkRewardStatus, 30000);
    return () => clearInterval(interval);
  }, [fid, checkedIn]);
  
  const handleClaim = useCallback(async () => {
    if (!canClaim || claiming) return;
    
    setClaiming(true);
    setError(null);
    setSuccess(false);
    triggerHaptic("light");
    
    try {
      // Ensure wallet is connected
      if (!isConnected) {
        try {
          await connectAsync({
            chainId: base.id,
            connector: config.connectors[0], // Farcaster Frame connector
          });
        } catch (_connectError: any) {
          setError("Please connect your wallet to claim rewards");
          setClaiming(false);
          return;
        }
      }
      
      // Ensure we're on Base chain
      if (chainId !== base.id) {
        try {
          await switchChainAsync({ chainId: base.id });
        } catch (_switchError: any) {
          setError("Please switch to Base network to claim rewards");
          setClaiming(false);
          return;
        }
      }
      
      // Get transaction data from API
      const res = await fetch("/api/checkin/reward", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid }),
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to prepare claim transaction");
        setClaiming(false);
        return;
      }
      
      // Send transaction using Wagmi (user signs and pays gas)
      sendTransaction(
        {
          to: data.transaction.to as `0x${string}`,
          data: data.transaction.data as `0x${string}`,
          value: BigInt(data.transaction.value || "0"),
        },
        {
          onSuccess: (hash) => {
            setTxHash(hash);
            console.log("[RewardClaimButton] Transaction sent:", hash);
          },
          onError: (error: any) => {
            console.error("[RewardClaimButton] Transaction error:", error);
            setError(error.message || "Transaction failed. Please try again.");
            setClaiming(false);
          },
        }
      );
    } catch (error: any) {
      console.error("[RewardClaimButton] Error:", error);
      setError(error.message || "Network error. Please try again.");
      setClaiming(false);
    }
  }, [canClaim, claiming, isConnected, chainId, connectAsync, switchChainAsync, sendTransaction, fid, triggerHaptic]);
  
  // Watch for transaction confirmation
  useEffect(() => {
    if (isTxConfirmed && txHash) {
      // Transaction confirmed - update database
      const updateClaimStatus = async () => {
        try {
          const res = await fetch("/api/checkin/reward", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fid, txHash }),
          });
          
          const data = await res.json();
          
          if (res.ok && data.ok) {
            setSuccess(true);
            setCanClaim(false);
            triggerHaptic("medium");
            
            // Clear success message after 5 seconds
            setTimeout(() => {
              setSuccess(false);
            }, 5000);
          } else {
            setError(data.error || "Failed to update claim status");
          }
        } catch (error: any) {
          console.error("[RewardClaimButton] Error updating claim status:", error);
          setError("Transaction confirmed but failed to update status. Please refresh.");
        } finally {
          setClaiming(false);
        }
      };
      
      updateClaimStatus();
    }
  }, [isTxConfirmed, txHash, fid, triggerHaptic]);
  
  // Watch for transaction errors
  useEffect(() => {
    if (isTxError && txError) {
      setError(txError.message || "Transaction failed. Please try again.");
      setClaiming(false);
    }
  }, [isTxError, txError]);
  
  // Don't render if user hasn't checked in or can't claim
  if (!checkedIn || !canClaim) {
    return null;
  }
  
  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={handleClaim}
        disabled={claiming || loading || success || isTxPending || isTxConfirming}
        style={{
          width: "100%",
          background: "#c1b400",
          color: "#000000",
          border: "2px solid #000000",
          borderRadius: 8,
          padding: "10px 16px",
          fontSize: 14,
          fontWeight: 700,
          cursor: claiming || loading || success ? "not-allowed" : "pointer",
          opacity: claiming || loading || isTxPending || isTxConfirming ? 0.6 : success ? 0.8 : 1,
          transition: "all 0.2s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
        }}
        onMouseEnter={(e) => {
          if (!claiming && !loading && !success && !isTxPending && !isTxConfirming) {
            e.currentTarget.style.background = "#d4c700";
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.3)";
          }
        }}
        onMouseLeave={(e) => {
          if (!claiming && !loading && !success && !isTxPending && !isTxConfirming) {
            e.currentTarget.style.background = "#c1b400";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.2)";
          }
        }}
      >
        {isTxPending || isTxConfirming
          ? "Confirming..."
          : claiming
          ? "Preparing..."
          : success
          ? "Reward Claimed! ✓"
          : "Claim Reward"}
      </button>
      
      {error && (
        <p style={{ margin: "8px 0 0 0", color: "#ff4444", fontSize: 12, textAlign: "center", fontWeight: 600 }}>
          {error}
        </p>
      )}
      
      {success && txHash && (
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <a
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#c1b400",
              fontSize: 12,
              textDecoration: "underline",
              fontWeight: 600,
            }}
          >
            View transaction on Basescan
          </a>
        </div>
      )}
    </div>
  );
}

