"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
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
  const { isConnected, chainId, connector: activeConnector, address } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const baseHexChainId = `0x${base.id.toString(16)}`;

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

  const [isTxPending, setIsTxPending] = useState(false);
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);
  const { canClaim, claimedToday, isLoading, isClaiming, hasApiError, success, errorMessage, txHash } = status;
  const txHashForReceipt = txHash ? (txHash as `0x${string}`) : undefined;

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
      let provider: any = null;
      let connectorInUse = activeConnector ?? null;

      if (typeof window !== "undefined") {
        try {
          const miniAppModule = await import("@farcaster/miniapp-sdk");
          const miniAppProvider = miniAppModule?.default?.wallet?.ethProvider;
          if (miniAppProvider) {
            provider = miniAppProvider;
          }
        } catch (sdkError) {
          console.debug("[RewardClaimButton] MiniApp SDK not available", sdkError);
        }
      }

      const connectorMap = new Map<string, (typeof connectors)[number]>();
      if (connectorInUse) {
        connectorMap.set(connectorInUse.id, connectorInUse);
      }
      connectors.forEach((connector) => {
        if (connector) {
          connectorMap.set(connector.id, connector);
        }
      });

      const preferredOrder = [
        connectorInUse?.id,
        "farcaster",
        "farcaster-frame",
        "frame",
        "coinbaseWallet",
        "metaMask",
      ].filter(Boolean) as string[];

      const orderedConnectors = Array.from(
        new Map(
          [
            ...preferredOrder.map((id) => [id, connectorMap.get(id) ?? null]),
            ...connectorMap.entries(),
          ].filter((entry): entry is [string, (typeof connectors)[number]] => Boolean(entry[1]))
        ).values()
      );

      const ensureConnected = async (connector: (typeof connectors)[number] | null) => {
        if (!connector) return null;
        try {
          if (!isConnected || activeConnector?.id !== connector.id) {
            await connectAsync({ connector, chainId: base.id });
          }
          const providerInstance = await connector.getProvider?.();
          if (providerInstance) {
            connectorInUse = connector;
            return providerInstance;
          }
        } catch (connectorError) {
          console.warn(`[RewardClaimButton] Connector ${connector.id} failed`, connectorError);
        }
        return null;
      };

      if (!provider) {
        for (const connector of orderedConnectors) {
          provider = await ensureConnected(connector);
          if (provider) break;
        }
      }

      if (!provider && typeof window !== "undefined") {
        provider = (window as any)?.ethereum ?? null;
      }

      if (!provider) {
        throw new Error("No wallet provider detected. Please open the mini app in Frame or Coinbase Wallet.");
      }

      let accounts: string[] = [];
      try {
        accounts = await provider.request?.({ method: "eth_requestAccounts" });
        console.log("[RewardClaimButton] Accounts from provider:", accounts);
      } catch (accountsError) {
        console.warn("[RewardClaimButton] Unable to read accounts from provider", accountsError);
      }

      const fromAddress = accounts?.[0] ?? address;
      console.log("[RewardClaimButton] Using fromAddress:", fromAddress);
      if (!fromAddress) {
        throw new Error("No wallet account available. Please connect your wallet again.");
      }

      const ensureBaseChain = async () => {
        try {
          const currentChainHex = await provider.request?.({ method: "eth_chainId" });
          if (currentChainHex?.toLowerCase() !== baseHexChainId.toLowerCase()) {
            await provider.request?.({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: baseHexChainId }],
            });
          }
        } catch (switchError) {
          console.warn("[RewardClaimButton] Provider chain switch error", switchError);
          throw new Error("Please switch to Base network to claim rewards");
        }
      };

      await ensureBaseChain();

      const transactionRes = await fetch("/api/checkin/reward", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid, claimantAddress: fromAddress }),
      });

      const transactionData = await transactionRes.json().catch(() => null);

      if (!transactionRes.ok || !transactionData?.ok) {
        const errorMsg = transactionData?.error || "Failed to prepare claim transaction";
        console.error("[RewardClaimButton] API error:", errorMsg);

        const alreadyClaimed =
          transactionRes.status === 409 ||
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

      const txPayload = transactionData.transaction;
      if (!txPayload || !txPayload.to || !txPayload.data) {
        setStatus((prev) => ({
          ...prev,
          isClaiming: false,
          errorMessage: "Invalid transaction data received from server. Please contact support.",
        }));
        return;
      }

      const normalizedValue = (() => {
        const value = txPayload.value;
        if (!value) return "0x0";
        try {
          const big = BigInt(value);
          if (big === 0n) return "0x0";
          return `0x${big.toString(16)}`;
        } catch {
          return value;
        }
      })();

      const txParams = {
        from: fromAddress,
        to: txPayload.to,
        data: txPayload.data,
        value: normalizedValue,
      };

      let txHash: string | null = null;
      try {
        txHash = await provider.request?.({
          method: "eth_sendTransaction",
          params: [txParams],
        });
      } catch (sendError: any) {
        console.error("[RewardClaimButton] Transaction error:", sendError);
        let errorMessage = sendError?.message || "Transaction failed. Please try again.";
        if (errorMessage.toLowerCase().includes("user rejected")) {
          errorMessage = "Transaction cancelled by user.";
        }
        setStatus((prev) => ({
          ...prev,
          isClaiming: false,
          errorMessage,
        }));
        return;
      }

      if (!txHash || typeof txHash !== "string") {
        throw new Error("Failed to send transaction. Please try again.");
      }

      setStatus((prev) => ({ ...prev, txHash }));
      setIsTxPending(true);

      const waitForReceipt = async (hash: string) => {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          try {
            const receipt = await provider.request?.({
              method: "eth_getTransactionReceipt",
              params: [hash],
            });
            if (receipt) return receipt;
          } catch (receiptError) {
            console.warn("[RewardClaimButton] Waiting for receipt", receiptError);
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return null;
      };

      const receipt = await waitForReceipt(txHash);
      if (!receipt) {
        throw new Error("Transaction not confirmed yet. Please check again shortly.");
      }
      if (receipt.status === "0x0" || receipt.status === 0) {
        throw new Error("Transaction failed on-chain.");
      }

      try {
        const updateRes = await fetch("/api/checkin/reward", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fid, txHash }),
        });

        const updateData = await updateRes.json().catch(() => null);
        if (!updateRes.ok || !updateData?.ok) {
          throw new Error(updateData?.error || "Failed to update reward status.");
        }

        stopPolling();
        setStatus((prev) => ({
          ...prev,
          success: true,
          claimedToday: true,
          hasApiError: false,
          errorMessage: null,
          isClaiming: false,
          canClaim: false,
        }));
        triggerHaptic("medium");
        if (successTimerRef.current) {
          clearTimeout(successTimerRef.current);
        }
        successTimerRef.current = setTimeout(() => {
          setStatus((prev) => ({ ...prev, success: false }));
        }, 5000);
      } catch (putError: any) {
        console.error("[RewardClaimButton] Error updating reward status:", putError);
        setStatus((prev) => ({
          ...prev,
          isClaiming: false,
          hasApiError: true,
          errorMessage: putError?.message || "Failed to update reward status",
        }));
        return;
      } finally {
        setIsTxPending(false);
      }
    } catch (err: any) {
      console.error("[RewardClaimButton] Error:", err);
      setStatus((prev) => ({
        ...prev,
        isClaiming: false,
        errorMessage: err?.message || "Network error. Please try again.",
      }));
      setIsTxPending(false);
    }
  }, [
    claimedToday,
    hasApiError,
    isClaiming,
    isLoading,
    canClaim,
    triggerHaptic,
    isConnected,
    connectAsync,
    connectors,
    chainId,
    switchChainAsync,
    fid,
    stopPolling,
    activeConnector,
    address,
    baseHexChainId,
  ]);

  const hasClaimedBanner = claimedToday && !hasApiError;
  const isDisabled = isClaiming || isLoading || success || isTxPending;

  const buttonText = (() => {
    if (isTxPending) return "Confirming...";
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

