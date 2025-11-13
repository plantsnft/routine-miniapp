"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useConnect, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { useHapticFeedback } from "~/hooks/useHapticFeedback";

interface RewardClaimButtonProps {
  fid: number;
  checkedIn: boolean;
}

interface RewardStatus {
  canClaim: boolean | null;
  claimedToday: boolean;
  isLoading: boolean;
  isClaiming: boolean;
  hasApiError: boolean;
  success: boolean;
  errorMessage: string | null;
  txHash: string | null;
}

/**
 * Reward claim button component.
 * Shows a yellow thin bar below the streak info when reward is available.
 */
export function RewardClaimButton({ fid, checkedIn }: RewardClaimButtonProps) {
  const { triggerHaptic } = useHapticFeedback();
  const { isConnected, chainId } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [status, setStatus] = useState<RewardStatus>({
    canClaim: null,
    claimedToday: false,
    isLoading: true,
    isClaiming: false,
    hasApiError: false,
    success: false,
    errorMessage: null,
    txHash: null,
  });

  const { sendTransaction, error: txError, isError: isTxError, isPending: isTxPending } = useSendTransaction();
  const { canClaim, claimedToday, isLoading, isClaiming, hasApiError, success, errorMessage, txHash } = status;
  const txHashForReceipt = txHash ? (txHash as `0x${string}`) : undefined;

  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: txHashForReceipt,
  });

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopPolling();
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, [stopPolling]);

  useEffect(() => {
    if (!checkedIn || !fid) {
      setStatus((prev) => ({ ...prev, canClaim: false, isLoading: false }));
      stopPolling();
      return;
    }

    let isSubscribed = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/checkin/reward?fid=${fid}`);
        const data = await res.json().catch(() => ({}));

        if (!isSubscribed) return;

        if (res.ok && data.ok !== false) {
          const rewardAvailable = Boolean(data.canClaim);
          const claimed = Boolean(data.rewardClaimedToday);
          const explicitError = data.error && data.ok === false ? String(data.error) : null;

          setStatus((prev) => ({
            ...prev,
            canClaim: rewardAvailable,
            claimedToday: claimed,
            isLoading: false,
            hasApiError: Boolean(explicitError),
            errorMessage: explicitError,
            success: rewardAvailable ? false : prev.success,
            txHash: rewardAvailable ? null : prev.txHash,
            isClaiming: rewardAvailable ? false : prev.isClaiming,
          }));

          if (claimed) {
            stopPolling();
          }
        } else {
          setStatus((prev) => ({
            ...prev,
            canClaim: null,
            claimedToday: false,
            isLoading: false,
            hasApiError: true,
            errorMessage: data?.error || "Failed to check reward status. Please try again.",
          }));
        }
      } catch (err) {
        console.error("[RewardClaimButton] Error checking reward status:", err);
        if (!isSubscribed) return;
        setStatus((prev) => ({
          ...prev,
          canClaim: null,
          claimedToday: false,
          isLoading: false,
          hasApiError: true,
          errorMessage: "Failed to check reward status. Please try again.",
        }));
      }
    };

    setStatus((prev) => ({ ...prev, isLoading: true, errorMessage: null, hasApiError: false }));
    fetchStatus();

    stopPolling();
    pollingRef.current = setInterval(fetchStatus, 30000);

    return () => {
      isSubscribed = false;
      stopPolling();
    };
  }, [fid, checkedIn, stopPolling]);

  const handleClaim = useCallback(async () => {
    if (claimedToday && !hasApiError) return;
    if (isClaiming) return;

    if (isLoading && canClaim === null) {
      setStatus((prev) => ({ ...prev, errorMessage: "Please wait while we check your reward status..." }));
      return;
    }

    setStatus((prev) => ({
      ...prev,
      isClaiming: true,
      errorMessage: null,
      hasApiError: false,
      success: false,
    }));
    triggerHaptic("light");

    try {
      if (!isConnected) {
        try {
          const frameIds = new Set(["farcaster-frame", "frame"]);
          const isCapable = (connector: (typeof connectors)[number]) =>
            typeof (connector as any)?.getChainId === "function" && !frameIds.has(connector.id);

          const prioritizedIds = ["coinbaseWallet", "metaMask"];
          const prioritizedConnectors = prioritizedIds
            .map((id) => connectors.find((connector) => connector.id === id && isCapable(connector) && connector.ready))
            .filter(Boolean) as typeof connectors;

          const readyCapable = connectors.filter((connector) => isCapable(connector) && connector.ready);
          const fallbackCapable = connectors.filter((connector) => isCapable(connector));

          const preferredConnector =
            prioritizedConnectors[0] ??
            readyCapable[0] ??
            fallbackCapable[0];

          if (!preferredConnector) {
            throw new Error("No compatible wallet connector available");
          }

          await connectAsync({
            chainId: base.id,
            connector: preferredConnector,
          });
        } catch (_connectError: any) {
          setStatus((prev) => ({
            ...prev,
            isClaiming: false,
            errorMessage: "We couldn't find a compatible wallet. Please open the mini app in Coinbase Wallet or a standard browser.",
          }));
          return;
        }
      }

      if (chainId !== base.id) {
        try {
          await switchChainAsync({ chainId: base.id });
        } catch (_switchError: any) {
          setStatus((prev) => ({
            ...prev,
            isClaiming: false,
            errorMessage: "Please switch to Base network to claim rewards",
          }));
          return;
        }
      }

      const res = await fetch("/api/checkin/reward", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const errorMsg = data?.error || "Failed to prepare claim transaction";
        console.error("[RewardClaimButton] API error:", errorMsg);

        const alreadyClaimed =
          res.status === 409 ||
          (typeof errorMsg === "string" && errorMsg.toLowerCase().includes("already claimed"));

        if (alreadyClaimed) {
          setStatus((prev) => ({
            ...prev,
            canClaim: false,
            claimedToday: true,
            isClaiming: false,
            hasApiError: false,
            errorMessage: null,
            txHash: null,
          }));
          stopPolling();
          return;
        }

        setStatus((prev) => ({
          ...prev,
          isClaiming: false,
          hasApiError: true,
          errorMessage: errorMsg,
        }));
        return;
      }

      if (!data.transaction || !data.transaction.to || !data.transaction.data) {
        console.error("[RewardClaimButton] Invalid transaction data:", data);
        setStatus((prev) => ({
          ...prev,
          isClaiming: false,
          errorMessage: "Invalid transaction data received from server. Please contact support.",
        }));
        return;
      }

      const addressPattern = /^0x[a-fA-F0-9]{40}$/;
      if (!addressPattern.test(data.transaction.to)) {
        console.error("[RewardClaimButton] Invalid contract address format:", data.transaction.to);
        setStatus((prev) => ({
          ...prev,
          isClaiming: false,
          errorMessage: "Invalid contract address. Please ensure REWARD_CLAIM_CONTRACT_ADDRESS is set correctly in Vercel.",
        }));
        return;
      }

      sendTransaction(
        {
          to: data.transaction.to as `0x${string}`,
          data: data.transaction.data as `0x${string}`,
          value: BigInt(data.transaction.value || "0"),
        },
        {
          onSuccess: (hash) => {
            setStatus((prev) => ({ ...prev, txHash: hash as string }));
            console.log("[RewardClaimButton] Transaction sent:", hash);
          },
          onError: (sendError: any) => {
            console.error("[RewardClaimButton] Transaction error:", sendError);
            let errorMessage = sendError.message || "Transaction failed. Please try again.";
            if (sendError.message && sendError.message.includes("pattern")) {
              errorMessage = "Invalid contract address format. Please check REWARD_CLAIM_CONTRACT_ADDRESS in Vercel environment variables.";
            } else if (sendError.message && sendError.message.includes("user rejected")) {
              errorMessage = "Transaction cancelled by user.";
            }
            setStatus((prev) => ({
              ...prev,
              isClaiming: false,
              errorMessage,
            }));
          },
        }
      );
    } catch (err: any) {
      console.error("[RewardClaimButton] Error:", err);
      setStatus((prev) => ({
        ...prev,
        isClaiming: false,
        errorMessage: err?.message || "Network error. Please try again.",
      }));
    }
  }, [claimedToday, hasApiError, isClaiming, isLoading, canClaim, triggerHaptic, isConnected, connectAsync, connectors, chainId, switchChainAsync, fid, sendTransaction, stopPolling]);

  useEffect(() => {
    if (isTxConfirmed && txHashForReceipt) {
      const updateClaimStatus = async () => {
        try {
          const res = await fetch("/api/checkin/reward", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fid, txHash: txHashForReceipt }),
          });

          const data = await res.json().catch(() => null);

          if (res.ok && data?.ok) {
            stopPolling();
            setStatus((prev) => ({
              ...prev,
              success: true,
              claimedToday: true,
              hasApiError: false,
              errorMessage: null,
              isClaiming: false,
            }));
            triggerHaptic("medium");

            if (successTimerRef.current) {
              clearTimeout(successTimerRef.current);
            }
            successTimerRef.current = setTimeout(() => {
              setStatus((prev) => ({ ...prev, success: false }));
            }, 5000);
          } else {
            setStatus((prev) => ({
              ...prev,
              isClaiming: false,
              hasApiError: true,
              errorMessage: data?.error || "Failed to update claim status",
            }));
          }
        } catch (err: any) {
          console.error("[RewardClaimButton] Error updating claim status:", err);
          setStatus((prev) => ({
            ...prev,
            isClaiming: false,
            errorMessage: "Transaction confirmed but failed to update status. Please refresh.",
          }));
        }
      };

      updateClaimStatus();
    }
  }, [isTxConfirmed, txHashForReceipt, fid, triggerHaptic, stopPolling]);

  useEffect(() => {
    if (isTxError && txError) {
      setStatus((prev) => ({
        ...prev,
        isClaiming: false,
        errorMessage: txError.message || "Transaction failed. Please try again.",
      }));
    }
  }, [isTxError, txError]);

  const hasClaimedBanner = claimedToday && !hasApiError;
  const isDisabled = isClaiming || isLoading || success || isTxPending || isTxConfirming;

  const buttonText = (() => {
    if (isTxPending || isTxConfirming) return "Confirming...";
    if (isClaiming) return "Preparing...";
    if (success) return "Reward Claimed! ✓";
    if (isLoading) return "Checking...";
    if (hasApiError) return "Claim Reward";
    if (canClaim === true) return "Claim Reward";
    if (canClaim === false) return "Reward Not Available";
    return "Claim Reward";
  })();

  const buttonClassName = (() => {
    let className = "reward-claim-button";
    if (success) className += " reward-claim-button--success";
    if (isDisabled) className += " reward-claim-button--disabled";
    return className;
  })();

  if (!checkedIn) {
    return null;
  }

  return (
    <>
      <div className="reward-claim-container">
        {hasClaimedBanner ? (
          <div className="reward-claim-banner">
            <span className="reward-claim-banner__text">
              Thank you for walking your cat today. Your $CATWALK reward was sponsored by the community of rektguy holders.
            </span>
            <Image
              src="/rektguy-sponsor.png"
              alt="Rektguy celebratory illustration"
              width={72}
              height={72}
              priority={false}
              className="reward-claim-banner__image"
            />
          </div>
        ) : (
          <button onClick={handleClaim} disabled={isDisabled} className={buttonClassName}>
            {buttonText}
          </button>
        )}

        {errorMessage && <p className="reward-claim-error">{errorMessage}</p>}

        {success && txHash && (
          <div className="reward-claim-link">
            <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
              View transaction on Basescan
            </a>
          </div>
        )}
      </div>

      <style jsx>{`
        .reward-claim-container {
          margin-top: 12px;
        }

        .reward-claim-button {
          width: 100%;
          background: #c1b400;
          color: #000000;
          border: 2px solid #000000;
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .reward-claim-button:not([disabled]):hover {
          background: #d4c700;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .reward-claim-button--success {
          background: #666666;
          color: #999999;
          opacity: 0.8;
        }

        .reward-claim-button--disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .reward-claim-banner {
          width: 100%;
          background: #f4f2c2;
          color: #2a2616;
          border: 2px solid #000000;
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.5;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .reward-claim-banner__text {
          flex: 1;
          text-align: left;
        }

        .reward-claim-banner__image {
          border-radius: 10px;
          border: 2px solid #000000;
          background: #000;
          animation: rektguyFloat 2.6s ease-in-out infinite;
        }

        .reward-claim-error {
          margin: 8px 0 0 0;
          color: #ff4444;
          font-size: 12px;
          text-align: center;
          font-weight: 600;
        }

        .reward-claim-link {
          margin-top: 8px;
          text-align: center;
        }

        .reward-claim-link a {
          color: #c1b400;
          font-size: 12px;
          text-decoration: underline;
          font-weight: 600;
        }

        @keyframes rektguyFloat {
          0%, 100% {
            transform: translateY(0px) rotate(-1deg);
          }
          50% {
            transform: translateY(-5px) rotate(1.5deg);
          }
        }
      `}</style>
    </>
  );
}

