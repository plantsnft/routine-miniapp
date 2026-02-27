'use client';

import { useState } from 'react';
import type { MouseEvent } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAuth } from './AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { BASE_CHAIN_ID, GAME_ESCROW_CONTRACT } from '~/lib/constants';
import { amountToUnits } from '~/lib/amounts';
import { encodeJoinGame, encodeApprove } from '~/lib/transaction-encoding';
import type { Game } from '~/lib/types';

interface PaymentButtonProps {
  game: Game;
  playerFid: number;
  onSuccess: (txHash: string, password: string | null) => void;
  onError: (error: string) => void;
  compact?: boolean; // If true, renders as small inline button instead of large button
  buttonRef?: React.RefObject<HTMLButtonElement | null>; // Optional ref to the button element
  customText?: string; // Optional custom button text (overrides default text)
}

export function PaymentButton({ game, playerFid, onSuccess, onError, compact = false, buttonRef, customText }: PaymentButtonProps) {
  const { token } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'idle' | 'preparing' | 'approving' | 'paying' | 'confirming'>('idle');

  const handlePayment = async (e?: MouseEvent<HTMLButtonElement>) => {
    // Prevent event propagation to parent elements (e.g., Link components)
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!token) {
      onError('Authentication required. Please sign in.');
      return;
    }
    if (!game.entry_fee_amount) {
      onError('Entry fee not configured');
      return;
    }

    // PRE-FLIGHT CHECK: Verify user hasn't already joined on-chain
    // This prevents the wallet from showing "Already joined" error
    setProcessing(true);
    setStep('preparing');
    
    try {
      console.log('[PaymentButton] Pre-flight check: verifying user has not already joined...');
      const recoverRes = await authedFetch('/api/payments/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          fid: playerFid,
        }),
      }, token);

      if (recoverRes.ok) {
        const recoverData = await recoverRes.json();
        // If recovery succeeded, user has already paid - sync and show credentials
        if (recoverData.data?.recovered || recoverData.data?.participant?.status === 'paid') {
          console.log('[PaymentButton] User has already joined on-chain, syncing database...');
          onSuccess('recovered', recoverData.data?.game_password || null);
          setProcessing(false);
          return;
        }
      }
      // If recovery failed or user hasn't joined, proceed with payment flow
      console.log('[PaymentButton] Pre-flight check passed, proceeding with payment...');
    } catch (preCheckErr: any) {
      // Pre-check failed - proceed anyway (might be network error, etc.)
      console.warn('[PaymentButton] Pre-flight check failed, proceeding with payment anyway:', preCheckErr);
    }

    try {
      // Check if we're in a Farcaster mini app
      const isMiniApp = typeof sdk?.isInMiniApp === "function" 
        ? await sdk.isInMiniApp() 
        : false;

      if (!isMiniApp) {
        throw new Error('Payment only works inside the Farcaster mini app');
      }

      const currency = (game.entry_fee_currency || 'ETH') as 'ETH' | 'USDC' | 'BASE_ETH' | 'BETR';
      const isETH = currency === 'ETH' || currency === 'BASE_ETH';
      const amount = game.entry_fee_amount.toString();
      const amountWei = amountToUnits(amount, currency);

      // Prepare payment transaction data
      const prepareRes = await authedFetch('/api/payments/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, fid: playerFid }),
      }, token);

      if (!prepareRes.ok) {
        const data = await prepareRes.json();
        throw new Error(data.error || 'Failed to prepare payment');
      }

      const { data: paymentData } = await prepareRes.json();

      // Get Ethereum provider for sending transactions
      const ethProvider = await sdk.wallet.getEthereumProvider();
      if (!ethProvider) {
        throw new Error('Ethereum provider not available');
      }

      // Get the current account from the provider (used for both approve and pay)
      const accounts = await ethProvider.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No connected account found');
      }
      const userAddress = accounts[0] as `0x${string}`;

      let txHash: string;

      // For ERC20 tokens (USDC, BETR, etc.), check allowance and approve if needed (automatically proceed to payment)
      if (!isETH) {
        // Use tokenAddress from paymentData (provided by API)
        const tokenAddress = paymentData.tokenAddress;
        if (!tokenAddress) {
          throw new Error('Token address not provided for ERC20 payment');
        }
        
        // VALIDATION: Verify tokenAddress matches expected currency
        const { mapCurrencyToAddress } = await import('~/lib/contract-ops');
        const expectedTokenAddress = mapCurrencyToAddress(currency);
        if (tokenAddress.toLowerCase() !== expectedTokenAddress.toLowerCase()) {
          console.error('[PaymentButton] Token address mismatch:', {
            currency,
            expectedTokenAddress,
            receivedTokenAddress: tokenAddress,
          });
          throw new Error(`Token address mismatch for ${currency}. Expected ${expectedTokenAddress}, got ${tokenAddress}`);
        }
        
        setStep('approving');
        
        // Check current allowance
        const { ethers } = await import('ethers');
        const { BASE_RPC_URL } = await import('~/lib/constants');
        const { ERC20_ABI } = await import('~/lib/contracts');
        const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        
        try {
          console.log('[PaymentButton] Checking allowance for token:', {
            currency,
            tokenAddress,
            expectedTokenAddress,
            userAddress,
            escrowContract: GAME_ESCROW_CONTRACT,
          });
          
          const currentAllowance = await tokenContract.allowance(userAddress, GAME_ESCROW_CONTRACT);
          const requiredAmount = BigInt(amountWei);
          const allowanceBefore = currentAllowance.toString();
          
          console.log('[PaymentButton] Allowance check result:', {
            currency,
            tokenAddress,
            allowanceBefore,
            entryFee: amountWei,
            requiredAmount: requiredAmount.toString(),
            needsApproval: currentAllowance < requiredAmount,
            allowanceSufficient: currentAllowance >= requiredAmount,
          });
          
          // If allowance is insufficient, approve first
          if (currentAllowance < requiredAmount) {
            const approveData = encodeApprove(GAME_ESCROW_CONTRACT, amountWei);
            
            const approveTxHash = await ethProvider.request({
              method: 'eth_sendTransaction',
              params: [{
                from: userAddress,
                to: tokenAddress as `0x${string}`,
                value: '0x0' as `0x${string}`,
                data: approveData as `0x${string}`,
                chainId: `0x${BASE_CHAIN_ID.toString(16)}` as `0x${string}`,
              }],
            }) as string;

            if (!approveTxHash || !approveTxHash.startsWith('0x')) {
              throw new Error('Approval transaction failed or was rejected');
            }

            console.log(`[PaymentButton] ${currency} approval sent:`, approveTxHash);
            
            // Deterministic sequencing: wait for 1 confirmation OR poll allowance until >= entryFee (max 10s)
            const approveTx = await provider.getTransaction(approveTxHash);
            if (!approveTx) {
              throw new Error('Approval transaction not found');
            }
            
            try {
              // Wait for 1 confirmation (recommended approach)
              await approveTx.wait(1);
              console.log('[PaymentButton] Approval transaction confirmed');
            } catch (waitErr: any) {
              // If wait fails, fall back to polling allowance (max 10s)
              console.warn('[PaymentButton] Waiting for confirmation failed, polling allowance instead:', waitErr?.message);
              const startTime = Date.now();
              const maxWaitTime = 10000; // 10 seconds
              
              while (Date.now() - startTime < maxWaitTime) {
                const polledAllowance = await tokenContract.allowance(userAddress, GAME_ESCROW_CONTRACT);
                if (polledAllowance >= requiredAmount) {
                  console.log('[PaymentButton] Allowance updated via polling:', polledAllowance.toString());
                  break;
                }
                await new Promise(resolve => setTimeout(resolve, 500)); // Poll every 500ms
              }
              
              // Final check
              const finalAllowance = await tokenContract.allowance(userAddress, GAME_ESCROW_CONTRACT);
              if (finalAllowance < requiredAmount) {
                throw new Error('Approval transaction did not update allowance within timeout');
              }
            }
            
            const allowanceAfter = (await tokenContract.allowance(userAddress, GAME_ESCROW_CONTRACT)).toString();
            console.log('[PaymentButton] Allowance updated:', {
              tokenAddress,
              currency,
              allowanceBefore,
              allowanceAfter,
              entryFee: amountWei,
            });
          } else {
            console.log(`[PaymentButton] ${currency} allowance already sufficient, skipping approval`, {
              currency,
              tokenAddress,
              allowanceBefore,
              requiredAmount: requiredAmount.toString(),
              reason: 'User already has sufficient allowance for this token',
            });
          }
        } catch (approveErr: any) {
          // Log detailed error information for debugging
          console.error('[PaymentButton] Allowance check or approval failed:', {
            currency,
            tokenAddress,
            expectedTokenAddress,
            error: approveErr?.message || 'Unknown error',
            errorCode: approveErr?.code,
            stack: approveErr?.stack,
          });
          
          if (approveErr?.code === 4001 || approveErr?.message?.includes('rejected') || approveErr?.message?.includes('User rejected')) {
            throw new Error('Payment was cancelled');
          }
          
          // If allowance check failed, don't proceed with payment
          if (approveErr?.message?.includes('allowance') || approveErr?.code === 'CALL_EXCEPTION') {
            throw new Error(`Failed to check ${currency} allowance. Please ensure the token contract is correct and try again. Error: ${approveErr?.message || 'Unknown error'}`);
          }
          
          throw new Error(`${currency} approval failed: ${approveErr?.message || 'Unknown error'}`);
        }
      }

      setStep('paying');

      // Send payment transaction (automatically proceeds after approval if needed)
      const joinGameData = encodeJoinGame(game.id);
      const txValue = isETH ? `0x${BigInt(amountWei).toString(16)}` : '0x0';

      try {
        txHash = await ethProvider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: userAddress,
            to: GAME_ESCROW_CONTRACT as `0x${string}`,
            value: txValue as `0x${string}`,
            data: joinGameData as `0x${string}`,
            chainId: `0x${BASE_CHAIN_ID.toString(16)}` as `0x${string}`,
          }],
        }) as string;

        if (!txHash || !txHash.startsWith('0x')) {
          throw new Error('Transaction failed or was rejected');
        }

        console.log('[PaymentButton] Payment transaction sent:', txHash);
        
        // Ensure txHash is valid
        if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
          console.error('[PaymentButton] Invalid transaction hash received:', txHash);
          throw new Error('Invalid transaction hash received from wallet');
        }
      } catch (txErr: any) {
        console.error('[PaymentButton] Payment transaction error:', { error: txErr, message: txErr?.message, code: txErr?.code, stack: txErr?.stack });
        
        // Check if error is "Already joined" - user has paid on-chain but DB doesn't have record
        if (txErr?.message?.includes('Already joined') || txErr?.message?.includes('already joined')) {
          console.log('[PaymentButton] User already joined on-chain, attempting recovery...');
          try {
            // Try to recover the participant record from on-chain state
            const recoverRes = await authedFetch('/api/payments/recover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gameId: game.id,
                fid: playerFid,
              }),
            }, token);

            if (recoverRes.ok) {
              const recoverData = await recoverRes.json();
              console.log('[PaymentButton] Recovery successful:', recoverData);
              // Recovery succeeded - call onSuccess with null txHash since we recovered
              onSuccess('', recoverData.data?.game_password || null);
              return; // Exit early - recovery handled it
            } else {
              const recoverError = await recoverRes.json();
              console.error('[PaymentButton] Recovery failed:', recoverError);
              throw new Error('You have already paid for this game, but we could not sync your record. Please refresh the page or contact support.');
            }
          } catch (recoverErr: any) {
            console.error('[PaymentButton] Recovery attempt error:', recoverErr);
            throw new Error('You have already paid for this game on-chain. Please refresh the page or contact support if the issue persists.');
          }
        }
        
        if (txErr?.code === 4001 || txErr?.message?.includes('rejected') || txErr?.message?.includes('User rejected')) {
          throw new Error('Payment was cancelled');
        }
        throw new Error(`Payment transaction failed: ${txErr?.message || 'Unknown error'}`);
      }

      // Wait a moment for transaction to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));

      setStep('confirming');

      // Confirm payment on backend (includes on-chain verification)
      console.log('[PaymentButton] Confirming payment:', { gameId: game.id, fid: playerFid, txHash });
      try {
        const confirmRes = await authedFetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            fid: playerFid,
            txHash,
          }),
        }, token);

        if (!confirmRes.ok) {
          const data = await confirmRes.json();
          console.error('[PaymentButton] Confirm payment failed:', { status: confirmRes.status, error: data.error, data });
          
          // AUTO-HEAL: If confirm fails with 400/409, try recover
          if (confirmRes.status === 400 || confirmRes.status === 409) {
            console.log('[PaymentButton] Confirm failed, attempting recovery...');
            try {
              const recoverRes = await authedFetch('/api/payments/recover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  gameId: game.id,
                  txHash: txHash,
                }),
              }, token);

              if (recoverRes.ok) {
                const recoverData = await recoverRes.json();
                if (recoverData.data?.recovered || recoverData.data?.participant) {
                  console.log('[PaymentButton] Recovery successful, participant synced');
                  // Poll participants endpoint up to 3 times until status is joined
                  let pollCount = 0;
                  const maxPolls = 3;
                  const pollDelay = 1000; // 1 second

                  while (pollCount < maxPolls) {
                    await new Promise(resolve => setTimeout(resolve, pollDelay));
                    try {
                      const participantsRes = await authedFetch(`/api/games/${game.id}/participants`, {
                        method: 'GET',
                        cache: 'no-store',
                      }, token);
                      
                      if (participantsRes.ok) {
                        const participantsData = await participantsRes.json();
                        const participants = participantsData.data || [];
                        const userParticipant = participants.find((p: any) => 
                          (p.fid === playerFid || (p as any).player_fid === playerFid) &&
                          (p.status === 'joined' || p.status === 'paid')
                        );
                        
                        if (userParticipant) {
                          console.log('[PaymentButton] Participant status confirmed via polling');
                          // Success - call onSuccess with recovered password
                          onSuccess(txHash, recoverData.data?.game_password || null);
                          return; // Exit early - recovery handled it
                        }
                      }
                    } catch (pollErr) {
                      console.warn('[PaymentButton] Poll attempt failed:', pollErr);
                    }
                    pollCount++;
                  }
                  
                  // If polling didn't find participant, still try to proceed with recovery data
                  console.log('[PaymentButton] Polling completed, proceeding with recovery data');
                  onSuccess(txHash, recoverData.data?.game_password || null);
                  return;
                }
              }
            } catch (recoverErr: any) {
              console.error('[PaymentButton] Recovery attempt failed:', recoverErr);
              // Continue to throw original confirm error
            }
          }
          
          throw new Error(data.error || 'Failed to confirm payment');
        }

        const { data: confirmData } = await confirmRes.json();
        console.log('[PaymentButton] Payment confirmed successfully:', { participant: confirmData.participant });
        onSuccess(txHash, confirmData.game_password);
      } catch (confirmErr: any) {
        console.error('[PaymentButton] Confirm endpoint error:', confirmErr);
        // Re-throw to be caught by outer catch
        throw confirmErr;
      }
    } catch (err: any) {
      onError(err.message || 'Payment failed');
    } finally {
      setProcessing(false);
      setStep('idle');
    }
  };

  const getButtonText = () => {
    if (step === 'preparing') return 'Preparing...';
    if (step === 'approving') return 'Approving...';
    if (step === 'paying') return 'Processing...';
    if (step === 'confirming') return 'Confirming...';
    if (customText) return customText;
    if (compact) return 'Pay Now';
    return `Pay ${game.entry_fee_amount} ${game.entry_fee_currency || 'ETH'} & Join`;
  };

  if (compact) {
    // Small inline button style matching badges
    return (
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handlePayment(e);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        disabled={processing}
        className="hl-badge hl-badge--fire"
        style={{
          cursor: processing ? 'not-allowed' : 'pointer',
          padding: '4px 8px',
          fontSize: '12px',
          opacity: processing ? 0.6 : 1,
          border: 'none',
        }}
      >
        {getButtonText()}
      </button>
    );
  }

  // Large button style (original)
  return (
    <button
      ref={buttonRef}
      onClick={handlePayment}
      disabled={processing}
      className="w-full px-6 py-4 bg-purple-600 text-white rounded-lg font-bold text-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {getButtonText()}
    </button>
  );
}

