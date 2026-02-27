import { NextRequest, NextResponse } from "next/server";
// Cancel game endpoint - refunds all paid participants and deactivates game
import { ethers } from "ethers";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getClubForGame, requireClubOwner } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { GAME_ESCROW_CONTRACT, BASE_RPC_URL, BASE_CHAIN_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { GAME_ESCROW_ABI } from "~/lib/contracts";
import { getPlayerWalletAddress } from "~/lib/neynar-wallet";
import { isPaidGame, normalizeGame } from "~/lib/games";
import { logRefundEvent } from "~/lib/audit-logger";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import { verifyPaymentOnChain } from "~/lib/payment-verifier";
import { BASE_USDC_ADDRESS } from "~/lib/constants";
import { mapCurrencyToAddress, getCurrencyDecimals } from "~/lib/contract-ops";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

/**
 * POST /api/games/[id]/cancel
 * Cancel a game and refund all paid participants (club owner or global admin only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * IDEMPOTENT: If already cancelled, returns success (no-op)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = getCorrelationId(req);
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // Get version for deployment verification
    const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown';
    
    safeLog('info', '[games][cancel] Cancel game started', {
      correlationId,
      gameId,
      fid,
      gitSha,
    });
    
    // Admin gate: global admin OR club owner
    const clubId = await getClubForGame(gameId);
    if (!clubId) {
      const response = NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
      response.headers.set('X-App-Version', gitSha);
      return response;
    }
    
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
    }

    if (!GAME_ESCROW_CONTRACT) {
      const response = NextResponse.json<ApiResponse>(
        { ok: false, error: "Escrow contract not configured" },
        { status: 500 }
      );
      response.headers.set('X-App-Version', gitSha);
      return response;
    }

    // Fetch game - use pokerDb
    const games = await pokerDb.fetch<Game>('burrfriends_games', {
      filters: { id: gameId },
      select: '*',
      limit: 1,
    });

    if (!games || games.length === 0) {
      const response = NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
      response.headers.set('X-App-Version', gitSha);
      return response;
    }

    const game = games[0];
    
    // CRITICAL: Log game details IMMEDIATELY to verify isPaidGame logic
    const gameEntryFee = game.entry_fee_amount || (game as any).buy_in_amount || null;
    const gameGatingType = (game as any).gating_type || (game.entry_fee_amount ? 'entry_fee' : 'open');
    const isPaid = isPaidGame(game);
    
    safeLog('info', '[games][cancel] Game fetched - paid game check', {
      correlationId,
      gameId,
      gameStatus: game.status,
      entryFeeAmount: gameEntryFee,
      gatingType: gameGatingType,
      isPaidGame: isPaid,
      gitSha,
    });

    // IDEMPOTENCY: Cancel is idempotent - continue processing even if already cancelled
    // This allows re-attempting refunds if they failed on previous cancel
    const wasAlreadyCancelled = game.status === 'cancelled';
    if (wasAlreadyCancelled) {
      safeLog('info', '[games][cancel] Game already cancelled - proceeding with refund check (idempotent)', {
        correlationId,
        gameId,
        fid,
        isPaidGame: isPaid,
        gitSha,
      });
    }

    // INVARIANT: Prevent cancellation if already settled
    if (game.status === 'settled' || game.status === 'completed') {
      const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown';
      const response = NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot cancel a game that has already been settled or completed" },
        { status: 400 }
      );
      response.headers.set('X-App-Version', gitSha);
      return response;
    }

    // Only refund for paid games
    const refundResults: Array<{ 
      playerFid: number; 
      participantId?: string; 
      success: boolean; 
      txHash?: string | null; 
      error?: string; 
      address?: string; 
      addressSource?: 'payment_transfer_from' | 'payment_tx_from' | 'neynar' | 'stored' | 'tx_from' | 'unknown'; 
      receiptStatus?: number; 
      blockNumber?: number;
      payment_tx_hash?: string | null;
      payment_tx_from?: string | null;
      payment_tx_to?: string | null;
      payment_receipt_status?: number | null;
      payment_transfer_from?: string | null;
      payment_transfer_to?: string | null;
      payment_transfer_value_raw?: string | null;
      refund_address_chosen?: string | null;
    }> = [];
    let allParticipants: GameParticipant[] = [];
    let paidParticipants: GameParticipant[] = [];
    
    if (isPaidGame(game)) {
      // Use onchain_game_id if available, otherwise fall back to gameId
      // This ensures consistency with how games are created on-chain
      const onchainGameId = (game as any).onchain_game_id || gameId;
      const gatingType = (game as any).gating_type || (game.entry_fee_amount ? 'entry_fee' : 'open');
      const entryFeeAmount = game.entry_fee_amount || (game as any).buy_in_amount || null;
      
      // DIAGNOSTICS: Log game details
      // Get RPC URL host for logging (no secrets)
      const rpcUrlHost = BASE_RPC_URL ? new URL(BASE_RPC_URL).hostname : 'not-configured';
      
      safeLog('info', '[games][cancel] Starting refund process', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        gatingType,
        entryFeeAmount,
        entryFeeCurrency: game.entry_fee_currency || (game as any).buy_in_currency || 'ETH',
        chainId: BASE_CHAIN_ID,
        rpcUrlHost,
        escrowContract: GAME_ESCROW_CONTRACT,
      });
      
      // CRITICAL: Get all participants with EXPLICIT field selection to ensure tx_hash is included
      // Do NOT rely on default select - explicitly request all fields needed for refund eligibility
      // NOTE: wallet_address column does not exist in schema - removed to prevent 42703 error
      allParticipants = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
        filters: { game_id: gameId },
        select: 'id,fid,status,tx_hash,refund_tx_hash,refunded_at,paid_at',
      });
      
      // DIAGNOSTICS: Verify participants were fetched with tx_hash - CRITICAL for debugging
      const sampleP = allParticipants.length > 0 ? allParticipants[0] : null;
      const sampleParticipantKeys = sampleP ? Object.keys(sampleP) : [];
      const hasTxHash = !!(sampleP?.tx_hash);
      const txHashLen = sampleP?.tx_hash?.length || 0;
      
      safeLog('info', '[games][cancel] Participants fetched - field verification', {
        correlationId,
        gameId,
        participantsCount: allParticipants.length,
        sampleParticipantKeys,
        hasTxHash,
        txHashLen,
        sampleParticipantHasRefundTxHash: !!((sampleP as any)?.refund_tx_hash),
        sampleParticipantId: sampleP?.id,
        sampleParticipantFid: (sampleP as any)?.fid || sampleP?.player_fid,
        gitSha,
      });

      // DIAGNOSTICS: Log participant counts by status
      const participantsByStatus = allParticipants.reduce((acc: any, p: GameParticipant) => {
        const status = p.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      const participantsWithTxHash = allParticipants.filter((p: GameParticipant) => p.tx_hash && p.tx_hash.trim() !== '').length;
      
      // DIAGNOSTICS: Log sample participant data to verify fields are selected
      const sampleParticipant = allParticipants.length > 0 ? allParticipants[0] : null;
      safeLog('info', '[games][cancel] Participant statistics', {
        correlationId,
        gameId,
        totalParticipants: allParticipants.length,
        participantsByStatus,
        participantsWithTxHash,
        sampleParticipantFields: sampleParticipant ? {
          id: sampleParticipant.id,
          fid: (sampleParticipant as any).fid || sampleParticipant.player_fid,
          status: sampleParticipant.status,
          hasTxHash: !!(sampleParticipant.tx_hash),
          hasRefundTxHash: !!((sampleParticipant as any).refund_tx_hash),
          txHashLength: sampleParticipant.tx_hash?.length || 0,
        } : null,
      });

      // RECONCILIATION: Check pending refunds (refund_tx_hash exists but status != 'refunded')
      // This handles cases where serverless timed out before receipt confirmation
      const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
      const pendingRefunds = allParticipants.filter((p: GameParticipant) => {
        const hasRefundTxHash = (p as any).refund_tx_hash && (p as any).refund_tx_hash.trim() !== '';
        const notRefunded = p.status !== 'refunded';
        return hasRefundTxHash && notRefunded;
      });

      safeLog('info', '[games][cancel] Checking pending refunds for reconciliation', {
        correlationId,
        gameId,
        pendingRefundsCount: pendingRefunds.length,
      });

      // Reconcile pending refunds by checking their receipt status AND USDC Transfer events
      for (const pendingParticipant of pendingRefunds) {
        const playerFid = (pendingParticipant as any).fid || pendingParticipant.player_fid;
        const pendingRefundTxHash = (pendingParticipant as any).refund_tx_hash;
        
        // Get player address from payment transaction for verification
        let playerAddress: string | null = null;
        try {
          if (pendingParticipant.tx_hash) {
            const entryFeeAmountForVerification = game.entry_fee_amount || (game as any).buy_in_amount || 0;
            const entryFeeAmountNum = typeof entryFeeAmountForVerification === 'number' ? entryFeeAmountForVerification : parseFloat(String(entryFeeAmountForVerification)) || 0;
            
            // Get token address and decimals from game currency
            const entryFeeCurrency = game.entry_fee_currency || (game as any).buy_in_currency || 'USDC';
            const tokenAddress = mapCurrencyToAddress(entryFeeCurrency);
            const tokenDecimals = getCurrencyDecimals(entryFeeCurrency);
            
            const paymentVerification = await verifyPaymentOnChain({
              paymentTxHash: pendingParticipant.tx_hash,
              expectedEscrowAddress: GAME_ESCROW_CONTRACT,
              expectedTokenAddress: tokenAddress,
              expectedDecimals: tokenDecimals,
              expectedAmount: entryFeeAmountNum,
              chainId: BASE_CHAIN_ID,
            });
            
            if (paymentVerification.success) {
              playerAddress = paymentVerification.payerAddress;
            }
          }
        } catch (verifyErr) {
          safeLog('warn', '[games][cancel] Failed to get player address for reconciliation (non-critical)', {
            correlationId,
            gameId,
            playerFid,
            error: (verifyErr as any)?.message,
          });
        }
        
        try {
          const receipt = await provider.getTransactionReceipt(pendingRefundTxHash);
          
          if (receipt) {
            // receipt.status is 1 for success, 0 for failure, or null if pending
            const receiptStatus = receipt.status === 1;
            
            if (receiptStatus) {
              // CRITICAL: Verify token Transfer event was actually executed
              // Parse token Transfer logs to ensure funds were sent to participant
              const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
              const entryFeeCurrency = game.entry_fee_currency || (game as any).buy_in_currency || 'USDC';
              const tokenAddress = mapCurrencyToAddress(entryFeeCurrency);
              const tokenDecimals = getCurrencyDecimals(entryFeeCurrency);
              const expectedTokenLower = tokenAddress.toLowerCase();
              const expectedEscrowLower = GAME_ESCROW_CONTRACT.toLowerCase();
              const entryFeeAmountForRefund = game.entry_fee_amount || (game as any).buy_in_amount || 0;
              const entryFeeAmountNum = typeof entryFeeAmountForRefund === 'number' ? entryFeeAmountForRefund : parseFloat(String(entryFeeAmountForRefund)) || 0;
              const expectedAmountRaw = BigInt(Math.floor(entryFeeAmountNum * (10 ** tokenDecimals)));
              
              let refundTransferFound = false;
              
              if (playerAddress) {
                const expectedPlayerLower = playerAddress.toLowerCase();
                
                // Parse receipt logs for token Transfer events
                for (const log of receipt.logs) {
                  if (log.address.toLowerCase() !== expectedTokenLower) continue;
                  if (!log.topics || log.topics.length < 3 || log.topics[0] !== TRANSFER_TOPIC) continue;
                  
                  const fromAddress = '0x' + log.topics[1].slice(-40);
                  const toAddress = '0x' + log.topics[2].slice(-40);
                  const valueBigInt = BigInt(log.data);
                  
                  // Verify: Transfer FROM escrow TO player with correct amount
                  if (
                    fromAddress.toLowerCase() === expectedEscrowLower &&
                    toAddress.toLowerCase() === expectedPlayerLower &&
                    valueBigInt === expectedAmountRaw
                  ) {
                    refundTransferFound = true;
                    break;
                  }
                }
              }
              
              if (!refundTransferFound && playerAddress) {
                // Receipt succeeded but token Transfer not found - clear refund_tx_hash for retry
                safeLog('error', '[games][cancel] Reconciliating pending refund - receipt succeeded but token Transfer not found', {
                  correlationId,
                  gameId,
                  playerFid,
                  refundTxHash: pendingRefundTxHash,
                  receiptStatus: receipt.status,
                  blockNumber: receipt.blockNumber,
                  expectedPlayerAddress: playerAddress,
                  expectedAmount: expectedAmountRaw.toString(),
                });
                
                await pokerDb.update<GameParticipant>('burrfriends_participants',
                  { game_id: gameId, fid: playerFid },
                  { refund_tx_hash: null } as any
                );
                
                refundResults.push({
                  playerFid,
                  participantId: pendingParticipant.id,
                  success: false,
                  txHash: null,
                  receiptStatus: receipt.status,
                  error: 'Refund transaction succeeded but token Transfer not verified. Cleared for retry.',
                  address: undefined,
                  addressSource: undefined,
                  payment_tx_hash: pendingParticipant.tx_hash || null,
                  payment_tx_from: null,
                  payment_tx_to: null,
                  payment_receipt_status: null,
                  refund_address_chosen: null,
                });
                continue;
              }
              
              // Refund succeeded AND token Transfer verified - update status to refunded
              safeLog('info', '[games][cancel] Reconciliating pending refund - receipt and token Transfer confirmed', {
                correlationId,
                gameId,
                playerFid,
                refundTxHash: pendingRefundTxHash,
                receiptStatus: receipt.status,
                blockNumber: receipt.blockNumber,
                usdcTransferVerified: refundTransferFound,
              });
              
              await pokerDb.update<GameParticipant>('burrfriends_participants',
                { game_id: gameId, fid: playerFid },
                {
                  status: 'refunded',
                  refunded_at: new Date().toISOString(),
                } as any
              );
              
              // Add to refund results as successful
              refundResults.push({
                playerFid,
                participantId: pendingParticipant.id,
                success: true,
                txHash: pendingRefundTxHash,
                receiptStatus: 1,
                address: playerAddress || undefined,
                addressSource: playerAddress ? 'payment_transfer_from' : undefined,
                payment_tx_hash: pendingParticipant.tx_hash || null,
                payment_tx_from: null,
                payment_tx_to: null,
                payment_receipt_status: null,
                refund_address_chosen: playerAddress || null,
              });
            } else if (receipt.status === 0) {
              // IDEMPOTENCY: Only clear refund_tx_hash on explicit failure (receipt.status === 0)
              // Do NOT clear if receipt is null (pending) - keep hash for retry on next cancel
              // Refund failed on-chain - clear refund_tx_hash to allow retry (Option B: no schema change)
              safeLog('error', '[games][cancel] Reconciliating pending refund - receipt shows failure (status=0), clearing refund_tx_hash for retry', {
                correlationId,
                gameId,
                playerFid,
                refundTxHash: pendingRefundTxHash,
                receiptStatus: receipt.status,
                blockNumber: receipt.blockNumber,
              });
              
              // Clear refund_tx_hash so cancel can retry the refund
              await pokerDb.update<GameParticipant>('burrfriends_participants',
                { game_id: gameId, fid: playerFid },
                {
                  refund_tx_hash: null,
                } as any
              );
              
              refundResults.push({
                playerFid,
                participantId: pendingParticipant.id,
                success: false,
                txHash: null, // Cleared to allow retry
                receiptStatus: 0,
                error: `Refund transaction failed on-chain: status=${receipt.status}. Cleared refund_tx_hash for retry.`,
                address: undefined,
                addressSource: undefined,
                payment_tx_hash: pendingParticipant.tx_hash || null,
                payment_tx_from: null,
                payment_tx_to: null,
                payment_receipt_status: null,
                refund_address_chosen: null,
              });
            } else {
              // Receipt exists but status is neither 1 nor 0 (unexpected state)
              safeLog('warn', '[games][cancel] Reconciliating pending refund - receipt has unexpected status, keeping refund_tx_hash', {
                correlationId,
                gameId,
                playerFid,
                refundTxHash: pendingRefundTxHash,
                receiptStatus: receipt.status,
              });
              
              refundResults.push({
                playerFid,
                participantId: pendingParticipant.id,
                success: false,
                txHash: pendingRefundTxHash, // Keep hash for retry
                receiptStatus: receipt.status as number,
                error: `Refund transaction has unexpected status: ${receipt.status}`,
                address: undefined,
                addressSource: undefined,
                payment_tx_hash: pendingParticipant.tx_hash || null,
                payment_tx_from: null,
                payment_tx_to: null,
                payment_receipt_status: null,
                refund_address_chosen: null,
              });
            }
          } else {
            // IDEMPOTENCY: Receipt not found (null) - transaction might still be pending
            // Keep refund_tx_hash so reconciliation can check again on next cancel
            // Do NOT clear - only clear on explicit failure (receipt.status === 0)
            safeLog('warn', '[games][cancel] Reconciliating pending refund - receipt not found (may still be pending), keeping refund_tx_hash', {
              correlationId,
              gameId,
              playerFid,
              refundTxHash: pendingRefundTxHash,
            });
            
            refundResults.push({
              playerFid,
              participantId: pendingParticipant.id,
              success: false,
              txHash: pendingRefundTxHash, // Keep hash - will check again on next cancel
              error: 'Refund transaction receipt not found - may still be pending. Will retry reconciliation on next cancel.',
              address: undefined,
              addressSource: undefined,
              payment_tx_hash: pendingParticipant.tx_hash || null,
              payment_tx_from: null,
              payment_tx_to: null,
              payment_receipt_status: null,
              refund_address_chosen: null,
            });
          }
        } catch (reconcileError: any) {
          safeLog('error', '[games][cancel] Failed to reconcile pending refund', {
            correlationId,
            gameId,
            playerFid,
            refundTxHash: pendingRefundTxHash,
            error: reconcileError?.message || 'Unknown error',
          });
          
          refundResults.push({
            playerFid,
            participantId: pendingParticipant.id,
            success: false,
            txHash: pendingRefundTxHash,
            error: reconcileError?.message || 'Failed to check refund receipt',
            address: undefined,
            addressSource: undefined,
            payment_tx_hash: pendingParticipant.tx_hash || null,
            payment_tx_from: null,
            payment_tx_to: null,
            payment_receipt_status: null,
            refund_address_chosen: null,
          });
        }
      }

      // Filter to only paid participants (those who need refunds)
      // CRITICAL: Only count participants with verified payments (tx_hash + verified receipt success)
      // Exclude already refunded participants to avoid attempting double refunds
      // Also exclude participants that already have a refund_tx_hash (handled by reconciliation above)
      const entryFeeAmountForEligibility = game.entry_fee_amount || (game as any).buy_in_amount || 0;
      const entryFeeAmountNum = typeof entryFeeAmountForEligibility === 'number' ? entryFeeAmountForEligibility : parseFloat(String(entryFeeAmountForEligibility)) || 0;
      
      paidParticipants = allParticipants.filter((p: GameParticipant) => {
        const hasPaidStatus = p.status === 'joined' || p.status === 'paid' || (p as any).payment_status === 'paid';
        const hasTxHash = p.tx_hash && p.tx_hash.trim() !== '';
        // Only refund if refund_tx_hash is null/empty (not already attempted or completed)
        const hasNoRefundTx = !(p as any).refund_tx_hash || (p as any).refund_tx_hash.trim() === '';
        const notRefunded = p.status !== 'refunded';
        
        // Basic eligibility: has paid status, has tx_hash, no existing refund
        const basicEligible = hasPaidStatus && hasTxHash && hasNoRefundTx && notRefunded;
        
        // DIAGNOSTICS: Log why participants are/aren't eligible
        if (hasPaidStatus) {
          if (!hasTxHash) {
            safeLog('info', '[games][cancel] Participant excluded from refund (missing tx_hash)', {
              correlationId,
              gameId,
              playerFid: (p as any).fid || p.player_fid,
              participantId: p.id,
              status: p.status,
              hasTxHash: false,
            });
          } else if (!hasNoRefundTx) {
            safeLog('info', '[games][cancel] Participant excluded from refund (already has refund_tx_hash)', {
              correlationId,
              gameId,
              playerFid: (p as any).fid || p.player_fid,
              participantId: p.id,
              status: p.status,
              hasRefundTxHash: true,
              refundTxHash: (p as any).refund_tx_hash,
            });
          } else if (!notRefunded) {
            safeLog('info', '[games][cancel] Participant excluded from refund (already refunded)', {
              correlationId,
              gameId,
              playerFid: (p as any).fid || p.player_fid,
              participantId: p.id,
              status: p.status,
            });
          }
        }
        
        return basicEligible;
      });
      
      // NOTE: Payment verification happens per-participant during refund loop
      // This ensures we only attempt refunds for verified payments

      // CRITICAL: Log eligibility check with detailed diagnostics
      safeLog('info', '[games][cancel] Refund eligibility check', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        participantsConsidered: allParticipants.length,
        eligibleForRefund: paidParticipants.length,
        escrowContract: GAME_ESCROW_CONTRACT,
        entryFeeAmount,
        entryFeeCurrency: game.entry_fee_currency || (game as any).buy_in_currency || 'ETH',
        eligibleParticipants: paidParticipants.map(p => ({
          participantId: p.id,
          fid: (p as any).fid || p.player_fid,
          status: p.status,
          hasTxHash: !!p.tx_hash,
          txHashLength: p.tx_hash?.length || 0,
          hasRefundTxHash: !!((p as any).refund_tx_hash),
        })),
        gitSha,
      });

      // Refund each paid participant
      const masterWalletPrivateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
      if (!masterWalletPrivateKey) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Master wallet private key not configured" },
          { status: 500 }
        );
      }

      const wallet = new ethers.Wallet(masterWalletPrivateKey, provider);
      const contract = new ethers.Contract(
        GAME_ESCROW_CONTRACT,
        GAME_ESCROW_ABI,
        wallet
      );


      for (const participant of paidParticipants) {
        // Declare variables outside try-catch so they're accessible in catch block
        const playerFid = (participant as any).fid || participant.player_fid;
        let playerAddress: string | null = null;
        let addressSource: 'payment_transfer_from' | 'payment_tx_from' | 'neynar' | 'stored' | 'tx_from' | 'unknown' = 'unknown';
        let paymentTxFrom: string | null = null;
        let paymentTxTo: string | null = null;
        let paymentReceiptStatus: number | null = null;
        
        if (!playerFid) {
          const errorMsg = 'Participant missing FID';
          safeLog('error', '[games][cancel] Participant missing FID', {
            correlationId,
            gameId,
            participantId: participant.id,
          });
          refundResults.push({
            playerFid: 0,
            participantId: participant.id,
            success: false,
            error: errorMsg,
            payment_tx_hash: participant.tx_hash || null,
            payment_tx_from: null,
            payment_tx_to: null,
            payment_receipt_status: null,
            refund_address_chosen: null,
            addressSource: 'unknown',
          });
          continue;
        }

        // CRITICAL: Verify payment on-chain and extract authoritative payer address from USDC Transfer log
        // This ensures we refund to the actual wallet that transferred USDC, not tx.from (which could be a paymaster)
        
        if (!participant.tx_hash) {
          const errorMsg = 'Participant missing payment transaction hash';
          safeLog('error', '[games][cancel] Participant missing payment tx_hash', {
            correlationId,
            gameId,
            playerFid,
            participantId: participant.id,
          });
          refundResults.push({
            playerFid,
            participantId: participant.id,
            success: false,
            error: errorMsg,
            payment_tx_hash: null,
            payment_tx_from: null,
            payment_tx_to: null,
            payment_receipt_status: null,
            payment_transfer_from: null,
            payment_transfer_to: null,
            payment_transfer_value_raw: null,
            refund_address_chosen: null,
            addressSource: 'unknown',
          });
          continue;
        }

        // Verify payment on-chain using token Transfer logs (authoritative)
        const entryFeeAmountForVerification = game.entry_fee_amount || (game as any).buy_in_amount || 0;
        const entryFeeAmountNum = typeof entryFeeAmountForVerification === 'number' ? entryFeeAmountForVerification : parseFloat(String(entryFeeAmountForVerification)) || 0;
        
        // Get token address and decimals from game currency
        const entryFeeCurrency = game.entry_fee_currency || (game as any).buy_in_currency || 'USDC';
        const tokenAddress = mapCurrencyToAddress(entryFeeCurrency);
        const tokenDecimals = getCurrencyDecimals(entryFeeCurrency);
        
        const paymentVerification = await verifyPaymentOnChain({
          paymentTxHash: participant.tx_hash,
          expectedEscrowAddress: GAME_ESCROW_CONTRACT,
          expectedTokenAddress: tokenAddress,
          expectedDecimals: tokenDecimals,
          expectedAmount: entryFeeAmountNum,
          chainId: BASE_CHAIN_ID,
        });

        if (!paymentVerification.success) {
          // Payment verification failed - do NOT attempt refund
          const errorMsg = `Payment verification failed: ${paymentVerification.error}`;
          safeLog('error', '[games][cancel] Payment verification failed - skipping refund', {
            correlationId,
            gameId,
            playerFid,
            participantId: participant.id,
            paymentTxHash: participant.tx_hash,
            verificationError: paymentVerification.error,
            diagnostics: paymentVerification.diagnostics,
          });
          
          refundResults.push({
            playerFid,
            participantId: participant.id,
            success: false,
            error: errorMsg,
            payment_tx_hash: participant.tx_hash,
            payment_tx_from: paymentVerification.diagnostics.txFrom,
            payment_tx_to: paymentVerification.diagnostics.txTo,
            payment_receipt_status: paymentVerification.diagnostics.receiptStatus,
            payment_transfer_from: null,
            payment_transfer_to: null,
            payment_transfer_value_raw: null,
            refund_address_chosen: null,
            addressSource: 'unknown',
          });
          continue;
        }

        // Payment verified - use Transfer.from as the authoritative refund address
        playerAddress = paymentVerification.payerAddress;
        addressSource = 'payment_transfer_from';
        paymentTxFrom = paymentVerification.txFrom;
        paymentTxTo = paymentVerification.txTo;
        paymentReceiptStatus = paymentVerification.receiptStatus;
        
        safeLog('info', '[games][cancel] Payment verified - using USDC Transfer.from as refund address (authoritative)', {
          correlationId,
          gameId,
          playerFid,
          participantId: participant.id,
          paymentTxHash: participant.tx_hash,
          refundAddress: playerAddress,
          addressSource,
          paymentTransferFrom: paymentVerification.payerAddress,
          paymentTransferTo: paymentVerification.escrowAddress,
          paymentTransferValue: paymentVerification.valueRaw,
          paymentReceiptStatus,
          blockNumber: paymentVerification.blockNumber,
        });

          // IDEMPOTENCY: If refund_tx_hash already exists and participant is already refunded, skip
          // (Pending refunds were already handled by reconciliation above)
          const existingRefundTxHash = (participant as any).refund_tx_hash;
          if (existingRefundTxHash && existingRefundTxHash.trim() !== '' && participant.status === 'refunded') {
            safeLog('info', '[games][cancel] Participant already refunded', {
              correlationId,
              gameId,
              playerFid,
              refundTxHash: existingRefundTxHash,
            });
              refundResults.push({
                playerFid,
                participantId: participant.id,
                success: true,
                txHash: existingRefundTxHash,
                address: playerAddress,
                addressSource: addressSource,
                payment_tx_hash: participant.tx_hash || null,
                payment_tx_from: paymentTxFrom,
                payment_tx_to: paymentTxTo,
                payment_receipt_status: paymentReceiptStatus,
                refund_address_chosen: playerAddress,
              });
            continue;
          }
          
        // If refund_tx_hash exists but status != 'refunded', it should have been reconciled above
        // If we still see it here, skip to avoid double refund
        if (existingRefundTxHash && existingRefundTxHash.trim() !== '') {
          safeLog('warn', '[games][cancel] Participant has refund_tx_hash but status not refunded - should have been reconciled', {
            correlationId,
            gameId,
            playerFid,
            refundTxHash: existingRefundTxHash,
            currentStatus: participant.status,
          });
          continue;
        }

        // Automatic retry logic with increasing gas price buffers
        const MAX_RETRIES = 3;
        const GAS_PRICE_BUFFERS = [50, 75, 100]; // Percentage buffers for each retry attempt
        let refundSucceeded = false;
        let lastError: any = null;
        let lockId: string | null = null;
        let lockExpiresAt: string | null = null;
        
        for (let attempt = 0; attempt < MAX_RETRIES && !refundSucceeded; attempt++) {
          try {
            // Check for existing refund_tx_hash before retrying (safety check)
            if (attempt > 0) {
              const existingParticipant = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
                filters: { game_id: gameId, fid: playerFid },
                select: 'refund_tx_hash,status',
                limit: 1,
              });
              
              if (existingParticipant && existingParticipant.length > 0) {
                const existing = existingParticipant[0] as any;
                const existingRefundTxHash = existing.refund_tx_hash;
                const existingStatus = existing.status;
                
                // If already refunded, skip retry
                if (existingStatus === 'refunded') {
                  safeLog('info', '[games][cancel] Participant already refunded during retry - skipping', {
                    correlationId,
                    gameId,
                    playerFid,
                    attempt,
                    existingRefundTxHash,
                  });
                  refundResults.push({
                    playerFid,
                    participantId: participant.id,
                    success: true,
                    txHash: existingRefundTxHash,
                    address: playerAddress,
                    addressSource,
                    payment_tx_hash: participant.tx_hash || null,
                    payment_tx_from: paymentTxFrom,
                    payment_tx_to: paymentTxTo,
                    payment_receipt_status: paymentReceiptStatus,
                    payment_transfer_from: paymentVerification.payerAddress,
                    payment_transfer_to: paymentVerification.escrowAddress,
                    payment_transfer_value_raw: paymentVerification.valueRaw,
                    refund_address_chosen: playerAddress,
                  });
                  refundSucceeded = true;
                  break;
                }
                
                // If refund_tx_hash exists, check if transaction is pending
                if (existingRefundTxHash && existingRefundTxHash.trim() !== '') {
                  try {
                    const pendingReceipt = await provider.getTransactionReceipt(existingRefundTxHash);
                    if (pendingReceipt) {
                      // Transaction already confirmed - verify it succeeded
                      if (pendingReceipt.status === 1) {
                        safeLog('info', '[games][cancel] Previous refund transaction confirmed during retry', {
                          correlationId,
                          gameId,
                          playerFid,
                          attempt,
                          refundTxHash: existingRefundTxHash,
                        });
                        // Transaction succeeded - mark as success (reconciliation will handle status update)
                        refundResults.push({
                          playerFid,
                          participantId: participant.id,
                          success: true,
                          txHash: existingRefundTxHash,
                          address: playerAddress,
                          addressSource,
                          receiptStatus: 1,
                          blockNumber: pendingReceipt.blockNumber,
                          payment_tx_hash: participant.tx_hash || null,
                          payment_tx_from: paymentTxFrom,
                          payment_tx_to: paymentTxTo,
                          payment_receipt_status: paymentReceiptStatus,
                          payment_transfer_from: paymentVerification.payerAddress,
                          payment_transfer_to: paymentVerification.escrowAddress,
                          payment_transfer_value_raw: paymentVerification.valueRaw,
                          refund_address_chosen: playerAddress,
                        });
                        refundSucceeded = true;
                        break;
                      } else {
                        // Transaction failed - clear hash and retry
                        safeLog('warn', '[games][cancel] Previous refund transaction failed - clearing and retrying', {
                          correlationId,
                          gameId,
                          playerFid,
                          attempt,
                          refundTxHash: existingRefundTxHash,
                          receiptStatus: pendingReceipt.status,
                        });
                        await pokerDb.update<GameParticipant>('burrfriends_participants',
                          { game_id: gameId, fid: playerFid },
                          { refund_tx_hash: null } as any
                        );
                      }
                    } else {
                      // Transaction still pending - wait a bit then check again
                      safeLog('info', '[games][cancel] Previous refund transaction still pending - waiting before retry', {
                        correlationId,
                        gameId,
                        playerFid,
                        attempt,
                        refundTxHash: existingRefundTxHash,
                      });
                      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                      const pendingReceipt2 = await provider.getTransactionReceipt(existingRefundTxHash);
                      if (pendingReceipt2 && pendingReceipt2.status === 1) {
                        // Transaction confirmed during wait
                        refundResults.push({
                          playerFid,
                          participantId: participant.id,
                          success: true,
                          txHash: existingRefundTxHash,
                          address: playerAddress,
                          addressSource,
                          receiptStatus: 1,
                          blockNumber: pendingReceipt2.blockNumber,
                          payment_tx_hash: participant.tx_hash || null,
                          payment_tx_from: paymentTxFrom,
                          payment_tx_to: paymentTxTo,
                          payment_receipt_status: paymentReceiptStatus,
                          payment_transfer_from: paymentVerification.payerAddress,
                          payment_transfer_to: paymentVerification.escrowAddress,
                          payment_transfer_value_raw: paymentVerification.valueRaw,
                          refund_address_chosen: playerAddress,
                        });
                        refundSucceeded = true;
                        break;
                      }
                      // Still pending or failed - continue with retry
                    }
                  } catch (checkError) {
                    // Error checking receipt - continue with retry
                    safeLog('warn', '[games][cancel] Error checking pending refund transaction - continuing retry', {
                      correlationId,
                      gameId,
                      playerFid,
                      attempt,
                      error: (checkError as any)?.message,
                    });
                  }
                }
              }
              
              // Small delay between retries
              if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Increasing delay
              }
            }
            
            // CRITICAL: Log refund attempt START with all diagnostics
            safeLog('info', '[games][cancel] Refunding participant - START', {
              correlationId,
              gameId,
              onchainGameId,
              fid,
              playerFid,
              participantId: participant.id,
              playerAddress,
              addressSource,
              paymentTxHash: participant.tx_hash,
              escrowContract: GAME_ESCROW_CONTRACT,
              attempt: attempt + 1,
              maxRetries: MAX_RETRIES,
              gitSha,
            });

            // ATOMIC LOCK: Claim refund lock BEFORE broadcasting transaction
            // This prevents double refund broadcasts from concurrent cancel calls
            // Lock expires after 5 minutes (300 seconds) to handle stuck locks
            // NOTE: Escrow contract has hasRefunded check, but it happens AFTER broadcast.
            // We need the lock BEFORE broadcast to prevent two concurrent calls from both broadcasting.
            // On retry, clear any existing lock from previous attempt
            if (attempt > 0) {
              try {
                await pokerDb.update<GameParticipant>('burrfriends_participants',
                  { game_id: gameId, fid: playerFid },
                  { refund_lock_id: null, refund_locked_at: null } as any
                );
                safeLog('info', '[games][cancel] Cleared lock from previous attempt before retry', {
                  correlationId,
                  gameId,
                  playerFid,
                  attempt: attempt + 1,
                });
              } catch (clearLockError) {
                // Non-critical - continue with lock acquisition
                safeLog('warn', '[games][cancel] Failed to clear lock from previous attempt (non-critical)', {
                  correlationId,
                  gameId,
                  playerFid,
                  error: (clearLockError as any)?.message,
                });
              }
            }
            
            lockId = `${correlationId}-${Date.now()}-${attempt}`;
            lockExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now
            const now = new Date().toISOString();
          
          // Attempt to acquire lock with two strategies:
          // 1. Try to acquire if refund_tx_hash is null AND refund_lock_id is null (no lock exists)
          // 2. If that fails, check if lock is expired and try to acquire by clearing expired lock
          let lockResult = await pokerDb.updateConditional<GameParticipant>(
            'burrfriends_participants',
            { game_id: gameId, fid: playerFid },
            {
              refund_lock_id: lockId,
              refund_locked_at: lockExpiresAt,
            } as any,
            { 
              refund_tx_hash: null, // Only lock if not already refunded
              refund_lock_id: null, // AND not already locked
            }
          );
          
          // If lock not acquired, check if existing lock is expired
          if (lockResult.rowsAffected === 0) {
            try {
              const existingParticipant = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
                filters: { game_id: gameId, fid: playerFid },
                select: 'refund_tx_hash,refund_lock_id,refund_locked_at',
                limit: 1,
              });
              
              if (existingParticipant && existingParticipant.length > 0) {
                const existing = existingParticipant[0] as any;
                const existingLockExpires = existing.refund_locked_at;
                
                // If lock exists but is expired, clear it and try again
                if (existingLockExpires && new Date(existingLockExpires) < new Date(now)) {
                  safeLog('info', '[games][cancel] Existing lock expired - clearing and retrying', {
                    correlationId,
                    gameId,
                    playerFid,
                    expiredLockId: existing.refund_lock_id,
                    expiredAt: existingLockExpires,
                  });
                  
                  // Clear expired lock
                  await pokerDb.update<GameParticipant>(
                    'burrfriends_participants',
                    { game_id: gameId, fid: playerFid },
                    {
                      refund_lock_id: null,
                      refund_locked_at: null,
                    } as any
                  );
                  
                  // Retry lock acquisition
                  lockResult = await pokerDb.updateConditional<GameParticipant>(
                    'burrfriends_participants',
                    { game_id: gameId, fid: playerFid },
                    {
                      refund_lock_id: lockId,
                      refund_locked_at: lockExpiresAt,
                    } as any,
                    { 
                      refund_tx_hash: null,
                      refund_lock_id: null,
                    }
                  );
                }
              }
            } catch (expiredLockError: any) {
              // Non-critical - continue with lock acquisition result
              safeLog('warn', '[games][cancel] Failed to check/clear expired locks (non-critical)', {
                correlationId,
                gameId,
                playerFid,
                error: expiredLockError?.message,
              });
            }
          }

          // Check if lock was acquired (rowsAffected > 0)
          if (lockResult.rowsAffected === 0) {
            // Lock not acquired - another concurrent call is processing this refund
            // Check if there's an existing lock or refund_tx_hash
            const existingParticipant = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
              filters: { game_id: gameId, fid: playerFid },
              select: 'refund_tx_hash,refund_lock_id,refund_locked_at',
              limit: 1,
            });
            
            const existingRefundTxHash = existingParticipant && existingParticipant.length > 0 
              ? (existingParticipant[0] as any).refund_tx_hash 
              : null;
            const existingLockId = existingParticipant && existingParticipant.length > 0 
              ? (existingParticipant[0] as any).refund_lock_id 
              : null;
            const existingLockExpires = existingParticipant && existingParticipant.length > 0 
              ? (existingParticipant[0] as any).refund_locked_at 
              : null;
            
            safeLog('warn', '[games][cancel] Refund lock not acquired - refund already in-flight', {
              correlationId,
              gameId,
              playerFid,
              attemptedLockId: lockId,
              existingRefundTxHash,
              existingLockId,
              existingLockExpires,
            });
            
            // Add to results as already processed (don't throw - continue with other refunds)
            refundResults.push({
              playerFid,
              participantId: participant.id,
              success: false,
              txHash: existingRefundTxHash,
              error: existingRefundTxHash 
                ? 'Refund already in progress (refund_tx_hash exists)'
                : 'Refund already in progress (lock held by another process)',
              address: playerAddress,
              addressSource,
              payment_tx_hash: participant.tx_hash || null,
              payment_tx_from: paymentTxFrom,
              payment_tx_to: paymentTxTo,
              payment_receipt_status: paymentReceiptStatus,
              payment_transfer_from: paymentVerification.payerAddress,
              payment_transfer_to: paymentVerification.escrowAddress,
              payment_transfer_value_raw: paymentVerification.valueRaw,
              refund_address_chosen: playerAddress,
            });
            continue; // Skip this participant - already being refunded
          }

          safeLog('info', '[games][cancel] Refund lock acquired - proceeding with broadcast', {
            correlationId,
            gameId,
            playerFid,
            lockId,
            lockExpiresAt,
          });

          // FAIL LOUD: Ensure refund is actually broadcast and confirmed
          safeLog('info', '[games][cancel] Calling contract.refundPlayer', {
            correlationId,
            gameId,
            onchainGameId,
            playerAddress,
            escrowContract: GAME_ESCROW_CONTRACT,
            gitSha,
          });

          // Get current gas price and add buffer to avoid REPLACEMENT_UNDERPRICED errors
          // Buffer increases with each retry attempt: 50% → 75% → 100%
          let tx: ethers.ContractTransactionResponse;
          try {
            const feeData = await provider.getFeeData();
            const currentGasPrice = feeData.gasPrice || await provider.getFeeData().then(f => f.gasPrice) || null;
            
            // Use increasing gas price buffer based on attempt number
            const gasPriceBufferPercent = GAS_PRICE_BUFFERS[attempt] || 100;
            const gasPriceWithBuffer = currentGasPrice 
              ? currentGasPrice + (currentGasPrice * BigInt(gasPriceBufferPercent) / BigInt(100))
              : undefined;
            
            safeLog('info', '[games][cancel] Attempting refund with gas price buffer', {
              correlationId,
              gameId,
              playerFid,
              attempt: attempt + 1,
              gasPriceBufferPercent,
              currentGasPrice: currentGasPrice?.toString(),
              gasPriceWithBuffer: gasPriceWithBuffer?.toString(),
            });
            
            tx = await contract.refundPlayer(onchainGameId, playerAddress, {
              gasPrice: gasPriceWithBuffer,
            });
          } catch (gasError: any) {
            // If gas price override fails, try without it (fallback)
            if (gasError?.code === 'UNSUPPORTED_OPERATION' || gasError?.message?.includes('gasPrice')) {
              safeLog('warn', '[games][cancel] Gas price override failed, using default', {
                correlationId,
                gameId,
                playerFid,
                attempt: attempt + 1,
                error: gasError?.message,
              });
              tx = await contract.refundPlayer(onchainGameId, playerAddress);
            } else {
              throw gasError;
            }
          }
          const refundTxHash = tx.hash; // Get tx hash immediately after broadcast

          // CRITICAL: Log refund transaction broadcasted
          safeLog('info', '[games][cancel] Refund transaction BROADCASTED', {
            correlationId,
            gameId,
            onchainGameId,
            playerFid,
            participantId: participant.id,
            refundTxHash,
            escrowContract: GAME_ESCROW_CONTRACT,
            gitSha,
          });

          // PHASE 1: Immediately persist refund_tx_hash and clear lock (after broadcast)
          // Update the locked row to set refund_tx_hash and clear the lock
          const updateResult = await pokerDb.updateConditional<GameParticipant>(
            'burrfriends_participants',
            { game_id: gameId, fid: playerFid, refund_lock_id: lockId }, // Only update if we hold the lock
            {
              refund_tx_hash: refundTxHash,
              refund_lock_id: null, // Clear lock after setting tx hash
              refund_locked_at: null,
              // Keep existing status (don't set to 'refunded' yet - wait for receipt confirmation)
            } as any,
            {} // No additional condition needed - we already verified the lock
          );

          // Check if update succeeded (rowsAffected > 0)
          if (updateResult.rowsAffected === 0) {
            // Lock was released or changed - this should not happen, but handle gracefully
            const errorMsg = `Failed to persist refund_tx_hash - lock was released or changed`;
            safeLog('error', '[games][cancel] Refund tx hash persistence failed - lock issue', {
              correlationId,
              gameId,
              playerFid,
              expectedHash: refundTxHash,
              lockId,
              rowsAffected: updateResult.rowsAffected,
            });
            throw new Error(errorMsg);
          }

          // FAIL-LOUD: Verify refund_tx_hash was actually persisted
          const persistedRefundTxHash = updateResult.updatedRows.length > 0 
            ? (updateResult.updatedRows[0] as any).refund_tx_hash 
            : null;
          
          if (!persistedRefundTxHash || persistedRefundTxHash !== refundTxHash) {
            const errorMsg = `Failed to persist refund_tx_hash - expected ${refundTxHash}, got ${persistedRefundTxHash}`;
            safeLog('error', '[games][cancel] Refund tx hash persistence verification failed', {
              correlationId,
              gameId,
              playerFid,
              expectedHash: refundTxHash,
              persistedHash: persistedRefundTxHash,
              rowsAffected: updateResult.rowsAffected,
            });
            throw new Error(errorMsg);
          }

          safeLog('info', '[games][cancel] Refund tx hash persisted and verified (phase 1)', {
            correlationId,
            gameId,
            playerFid,
            refundTxHash,
            updateRowsAffected: Array.isArray(updateResult) ? updateResult.length : 0,
            verified: true,
          });

          // PHASE 2: Wait for transaction receipt and verify success
          try {
            const receipt = await tx.wait();
            
            if (!receipt || !receipt.hash) {
              throw new Error("Transaction failed: no receipt");
            }

            // CRITICAL: Verify transaction actually succeeded (status === 1)
            const receiptStatus = receipt.status === 1;
            if (receipt.status === 0) {
              // IDEMPOTENCY: Only clear on explicit failure (status === 0)
              const statusValue = receipt.status;
              safeLog('error', '[games][cancel] Refund transaction failed on-chain (status=0) - clearing refund_tx_hash for retry', {
                correlationId,
                gameId,
                onchainGameId,
                playerFid,
                txHash: receipt.hash,
                receiptStatus: statusValue,
                blockNumber: receipt.blockNumber,
              });
              
              // Option B: Clear refund_tx_hash on failure to allow retry (no schema change)
              await pokerDb.update<GameParticipant>('burrfriends_participants',
                { game_id: gameId, fid: playerFid },
                {
                  refund_tx_hash: null,
                } as any
              );
              
              throw new Error(`Refund transaction failed on-chain: status=${statusValue}. Cleared refund_tx_hash for retry.`);
            } else if (!receiptStatus) {
              // Unexpected status (neither 1 nor 0)
              const statusValue = receipt.status;
              safeLog('error', '[games][cancel] Refund transaction has unexpected status', {
                correlationId,
                gameId,
                onchainGameId,
                playerFid,
                txHash: receipt.hash,
                receiptStatus: statusValue,
                blockNumber: receipt.blockNumber,
              });
              
              // Keep refund_tx_hash for manual investigation
              throw new Error(`Refund transaction has unexpected status: ${statusValue}. Refund_tx_hash kept for investigation.`);
            }
            
            // CRITICAL: Verify token Transfer event to ensure funds were actually sent to participant
            // Parse token Transfer logs to verify refund was actually executed
            const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
            const entryFeeCurrency = game.entry_fee_currency || (game as any).buy_in_currency || 'USDC';
            const tokenAddress = mapCurrencyToAddress(entryFeeCurrency);
            const tokenDecimals = getCurrencyDecimals(entryFeeCurrency);
            const expectedTokenLower = tokenAddress.toLowerCase();
            const expectedEscrowLower = GAME_ESCROW_CONTRACT.toLowerCase();
            const expectedPlayerLower = playerAddress.toLowerCase();
            const entryFeeAmountForRefund = game.entry_fee_amount || (game as any).buy_in_amount || 0;
            const entryFeeAmountNum = typeof entryFeeAmountForRefund === 'number' ? entryFeeAmountForRefund : parseFloat(String(entryFeeAmountForRefund)) || 0;
            // Convert to token units using token-specific decimals
            const expectedAmountRaw = BigInt(Math.floor(entryFeeAmountNum * (10 ** tokenDecimals)));
            
            let refundTransferFound = false;
            const foundTransfers: Array<{ from: string; to: string; value: string }> = [];
            
            // Parse receipt logs for token Transfer events
            for (const log of receipt.logs) {
              // Check if this log is from the token contract
              if (log.address.toLowerCase() !== expectedTokenLower) {
                continue;
              }
              
              // Check if this is a Transfer event
              if (!log.topics || log.topics.length < 3 || log.topics[0] !== TRANSFER_TOPIC) {
                continue;
              }
              
              // Parse Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
              const fromAddress = '0x' + log.topics[1].slice(-40);
              const toAddress = '0x' + log.topics[2].slice(-40);
              const valueBigInt = BigInt(log.data);
              
              foundTransfers.push({
                from: fromAddress,
                to: toAddress,
                value: valueBigInt.toString(),
              });
              
              // Verify: Transfer FROM escrow TO player with correct amount
              if (
                fromAddress.toLowerCase() === expectedEscrowLower &&
                toAddress.toLowerCase() === expectedPlayerLower &&
                valueBigInt === expectedAmountRaw
              ) {
                refundTransferFound = true;
                safeLog('info', '[games][cancel] Refund token Transfer verified on-chain', {
                  correlationId,
                  gameId,
                  onchainGameId,
                  playerFid,
                  refundTxHash: receipt.hash,
                  transferFrom: fromAddress,
                  transferTo: toAddress,
                  transferAmount: valueBigInt.toString(),
                  expectedAmount: expectedAmountRaw.toString(),
                  tokenAddress,
                  currency: entryFeeCurrency,
                });
                break;
              }
            }
            
            // If no matching Transfer found, refund transaction succeeded but token wasn't transferred
            if (!refundTransferFound) {
              const errorMsg = `Refund transaction succeeded but token Transfer not found. Expected: ${expectedAmountRaw.toString()} from ${GAME_ESCROW_CONTRACT} to ${playerAddress}. Found ${foundTransfers.length} Transfer(s) in receipt.`;
              safeLog('error', '[games][cancel] Refund transaction missing token Transfer', {
                correlationId,
                gameId,
                onchainGameId,
                playerFid,
                refundTxHash: receipt.hash,
                expectedAmount: expectedAmountRaw.toString(),
                expectedFrom: GAME_ESCROW_CONTRACT,
                expectedTo: playerAddress,
                foundTransfersCount: foundTransfers.length,
                foundTransfers: foundTransfers.slice(0, 5), // First 5 for diagnostics
              });
              
              // Clear refund_tx_hash to allow retry
              await pokerDb.update<GameParticipant>('burrfriends_participants',
                { game_id: gameId, fid: playerFid },
                { refund_tx_hash: null } as any
              );
              
              throw new Error(errorMsg);
            }

            safeLog('info', '[games][cancel] Refund transaction confirmed on-chain (phase 2)', {
              correlationId,
              gameId,
              onchainGameId,
              playerFid,
              refundTxHash: receipt.hash,
              receiptStatus: receipt.status,
              blockNumber: receipt.blockNumber,
              escrowContract: GAME_ESCROW_CONTRACT,
              usdcTransferVerified: true,
            });

            // PHASE 2: Only now set status='refunded' after receipt confirms success
            await pokerDb.update<GameParticipant>('burrfriends_participants',
              { game_id: gameId, fid: playerFid },
              {
                status: 'refunded',
                refunded_at: new Date().toISOString(),
              } as any
            );

            // AUDIT TRAIL: Log refund event
            await logRefundEvent({
              gameId,
              clubId: game.club_id,
              callerFid: fid,
              playerFid,
              amount: game.entry_fee_amount?.toString() || '0',
              currency: game.entry_fee_currency || 'ETH',
              txHash: refundTxHash,
              timestamp: new Date().toISOString(),
            });

            refundResults.push({ 
              playerFid, 
              participantId: participant.id,
              success: true, 
              txHash: refundTxHash, 
              address: playerAddress,
              addressSource,
              receiptStatus: 1,
              blockNumber: receipt.blockNumber,
              payment_tx_hash: participant.tx_hash || null,
              payment_tx_from: paymentTxFrom,
              payment_tx_to: paymentTxTo,
              payment_receipt_status: paymentReceiptStatus,
              payment_transfer_from: paymentVerification.payerAddress,
              payment_transfer_to: paymentVerification.escrowAddress,
              payment_transfer_value_raw: paymentVerification.valueRaw,
              refund_address_chosen: playerAddress,
            });
            
            // Mark as succeeded to exit retry loop
            refundSucceeded = true;
            break; // Exit retry loop on success
          } catch (receiptError: any) {
            // Receipt wait failed (timeout/RPC error) - refund_tx_hash is already persisted
            // IDEMPOTENCY: Do NOT clear refund_tx_hash on timeout/RPC errors - receipt might still be pending
            // Only clear on explicit failure (receipt.status === 0) which is handled above
            // Keep refund_tx_hash so reconciliation can check receipt later
            const errorMsg = receiptError?.reason || receiptError?.message || 'Unknown error';
            safeLog('error', '[games][cancel] Refund receipt wait failed (timeout/RPC error) - keeping refund_tx_hash for reconciliation', {
              correlationId,
              gameId,
              onchainGameId,
              playerFid,
              refundTxHash,
              error: errorMsg,
            });
            
            // DO NOT clear refund_tx_hash - keep it so reconciliation can check later
            // DO NOT throw - collect error and continue with other refunds
            refundResults.push({
              playerFid,
              participantId: participant.id,
              success: false,
              txHash: refundTxHash,
              error: `${errorMsg}. Refund_tx_hash kept for reconciliation.`,
              address: playerAddress,
              addressSource,
              receiptStatus: undefined,
              payment_tx_hash: participant.tx_hash || null,
              payment_tx_from: paymentTxFrom,
              payment_tx_to: paymentTxTo,
              payment_receipt_status: paymentReceiptStatus,
              payment_transfer_from: paymentVerification.payerAddress,
              payment_transfer_to: paymentVerification.escrowAddress,
              payment_transfer_value_raw: paymentVerification.valueRaw,
              refund_address_chosen: playerAddress,
            });
            
            // Don't mark as succeeded - receipt wait failed, but transaction might still be pending
            // Will be retried or handled by reconciliation
            if (attempt === MAX_RETRIES - 1) {
              // Last attempt failed - exit retry loop
              break;
            }
            // Otherwise, continue to next retry attempt
          }
        } catch (refundError: any) {
          const errorMsg = refundError?.reason || refundError?.message || 'Unknown error';
          const errorCode = refundError?.code;
          // Check if refund_tx_hash was set before the error (from phase 1)
          const partialRefundTxHash = (participant as any).refund_tx_hash;
          
          // Store error for potential retry
          lastError = refundError;
          
          // Determine if error is retryable
          const isRetryable = errorCode === 'REPLACEMENT_UNDERPRICED' || 
                             errorMsg?.includes('replacement') || 
                             errorMsg?.includes('underpriced') ||
                             errorCode === 'TIMEOUT' ||
                             errorMsg?.includes('timeout') ||
                             errorMsg?.includes('network');
          
          // For retryable errors, clear any partial refund_tx_hash to allow retry
          if (isRetryable && partialRefundTxHash) {
            safeLog('warn', '[games][cancel] Refund failed with retryable error - clearing hash for retry', {
              correlationId,
              gameId,
              onchainGameId,
              playerFid,
              attempt: attempt + 1,
              error: errorMsg,
              errorCode,
              paymentTxHash: participant.tx_hash,
            });
            try {
              await pokerDb.update<GameParticipant>('burrfriends_participants',
                { game_id: gameId, fid: playerFid },
                { refund_tx_hash: null } as any
              );
            } catch (clearError) {
              // Non-critical - log but continue
              safeLog('warn', '[games][cancel] Failed to clear partial refund_tx_hash (non-critical)', {
                correlationId,
                gameId,
                playerFid,
                error: (clearError as any)?.message,
              });
            }
          }
          
          safeLog('error', '[games][cancel] Failed to refund participant', {
            correlationId,
            gameId,
            onchainGameId,
            playerFid,
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
            error: errorMsg,
            errorCode,
            paymentTxHash: participant.tx_hash,
            hasRefundTxHash: !!partialRefundTxHash,
            isRetryable,
            willRetry: isRetryable && attempt < MAX_RETRIES - 1,
          });
          
          // If not retryable or last attempt, add to results and exit
          if (!isRetryable || attempt === MAX_RETRIES - 1) {
            refundResults.push({ 
              playerFid, 
              participantId: participant.id,
              success: false, 
              error: isRetryable && attempt === MAX_RETRIES - 1
                ? `Refund failed after ${MAX_RETRIES} attempts due to gas price issue. Please retry cancel to attempt refund again.`
                : errorMsg,
              txHash: partialRefundTxHash || null,
              address: playerAddress || undefined,
              addressSource: playerAddress ? addressSource : 'unknown',
              payment_tx_hash: participant.tx_hash || null,
              payment_tx_from: paymentTxFrom,
              payment_tx_to: paymentTxTo,
              payment_receipt_status: paymentReceiptStatus,
              payment_transfer_from: paymentVerification?.payerAddress || null,
              payment_transfer_to: paymentVerification?.escrowAddress || null,
              payment_transfer_value_raw: paymentVerification?.valueRaw || null,
              refund_address_chosen: playerAddress || null,
            });
            break; // Exit retry loop
          }
          // Otherwise, continue to next retry attempt (loop continues)
        }
        }
        
        // If retry loop completed without success and no error was added to results, add final error
        if (!refundSucceeded && lastError) {
          const errorMsg = lastError?.reason || lastError?.message || 'Unknown error';
          const errorCode = lastError?.code;
          const isRetryable = errorCode === 'REPLACEMENT_UNDERPRICED' || 
                             errorMsg?.includes('replacement') || 
                             errorMsg?.includes('underpriced');
          
          // Check if result was already added
          const existingResult = refundResults.find(r => r.playerFid === playerFid);
          if (!existingResult) {
            refundResults.push({ 
              playerFid, 
              participantId: participant.id,
              success: false, 
              error: isRetryable
                ? `Refund failed after ${MAX_RETRIES} attempts due to gas price issue. Please retry cancel to attempt refund again.`
                : errorMsg,
              txHash: null,
              address: playerAddress || undefined,
              addressSource: playerAddress ? addressSource : 'unknown',
              payment_tx_hash: participant.tx_hash || null,
              payment_tx_from: paymentTxFrom,
              payment_tx_to: paymentTxTo,
              payment_receipt_status: paymentReceiptStatus,
              payment_transfer_from: paymentVerification?.payerAddress || null,
              payment_transfer_to: paymentVerification?.escrowAddress || null,
              payment_transfer_value_raw: paymentVerification?.valueRaw || null,
              refund_address_chosen: playerAddress || null,
            });
          }
        }
      }

      // FAIL LOUD: If no refunds were attempted but eligible participants exist, return 500
      const failedRefunds = refundResults.filter(r => !r.success);
      const successfulRefunds = refundResults.filter(r => r.success);
      const refundsAttempted = refundResults.length;
      
      if (refundsAttempted === 0 && paidParticipants.length > 0) {
        // This should never happen - eligible participants exist but no refunds were attempted
        safeLog('error', '[games][cancel] No refunds attempted despite eligible participants - FAIL LOUD', {
          correlationId,
          gameId,
          onchainGameId,
          participantsConsidered: allParticipants.length,
          eligibleForRefund: paidParticipants.length,
          refundsAttempted: 0,
          escrowContract: GAME_ESCROW_CONTRACT,
          entryFeeAmount,
          entryFeeCurrency: game.entry_fee_currency || (game as any).buy_in_currency || 'ETH',
          participantsStatuses: participantsByStatus,
          participantsWithTxHash,
          gitSha,
        });
      const response = NextResponse.json<ApiResponse<{
        gameId: string;
        onchainGameId: string;
        isPaidGame: boolean;
        participantsConsidered: number;
        eligibleForRefund: number;
        refundsAttempted: number;
        refundsSucceeded: number;
        refundTxs: Array<any>;
      }>>({
        ok: false,
        error: `No refunds attempted for ${paidParticipants.length} eligible participant(s). Game not cancelled.`,
        data: {
          gameId,
          onchainGameId,
          isPaidGame: true,
          participantsConsidered: allParticipants.length,
          eligibleForRefund: paidParticipants.length,
          refundsAttempted: 0,
          refundsSucceeded: 0,
          refundTxs: [],
        },
      }, { status: 500 });
      response.headers.set('X-App-Version', gitSha);
      return response;
      }
      
      // DIAGNOSTICS: Log successful refunds summary
      safeLog('info', '[games][cancel] Refund summary', {
        correlationId,
        gameId,
        onchainGameId,
        participantsConsidered: allParticipants.length,
        eligibleForRefund: paidParticipants.length,
        refundsAttempted: refundResults.length,
        refundsSucceeded: successfulRefunds.length,
        refundsFailed: failedRefunds.length,
        escrowContract: GAME_ESCROW_CONTRACT,
        entryFeeAmount,
        entryFeeCurrency: game.entry_fee_currency || (game as any).buy_in_currency || 'ETH',
      });
    }

    // Update game status to cancelled
    await pokerDb.update<Game>('burrfriends_games', { id: gameId }, {
      status: 'cancelled',
    } as any);

    safeLog('info', '[games][cancel] Game cancelled successfully', {
      correlationId,
      gameId,
      fid,
    });

    // Create announcement for cancelled game (non-blocking - don't fail if this fails)
    try {
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE && game.club_id) {
        const gameTitle = game.title || 'Untitled Game';
        const entryFee = game.entry_fee_amount || (game as any).buy_in_amount;
        const entryFeeCurrency = game.entry_fee_currency || (game as any).buy_in_currency || 'USDC';
        const entryFeeText = entryFee ? `${entryFee} ${entryFeeCurrency}` : 'Free';
        
        const announcementTitle = `Game Cancelled: ${gameTitle}`;
        const announcementBody = `The game "${gameTitle}" has been cancelled.${entryFee ? ` All participants have been refunded their ${entryFeeText} entry fee.` : ''}`;

        const SUPABASE_SERVICE_HEADERS = {
          apikey: SUPABASE_SERVICE_ROLE,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
          "Content-Type": "application/json",
        };

        const annRes = await fetch(`${SUPABASE_URL}/rest/v1/club_announcements`, {
          method: "POST",
          headers: {
            ...SUPABASE_SERVICE_HEADERS,
            Prefer: "return=representation",
          },
          body: JSON.stringify([{
            club_id: game.club_id,
            creator_fid: fid,
            title: announcementTitle,
            body: announcementBody,
            related_game_id: gameId,
          }]),
        });

        if (annRes.ok) {
          safeLog('info', '[games][cancel] Cancellation announcement created', {
            correlationId,
            gameId,
            clubId: game.club_id,
            fid,
          });
        } else {
          const annText = await annRes.text();
          safeLog('warn', '[games][cancel] Failed to create cancellation announcement (non-critical)', {
            correlationId,
            gameId,
            clubId: game.club_id,
            error: annText,
          });
        }
      }
    } catch (announcementError: any) {
      // Non-blocking: log error but don't fail the cancellation
      safeLog('warn', '[games][cancel] Error creating cancellation announcement (non-critical)', {
        correlationId,
        gameId,
        error: announcementError?.message || 'Unknown error',
      });
    }

    // CRITICAL: Log final status with refund diagnostics
    const successfulRefunds = refundResults ? refundResults.filter((r: any) => r.success) : [];
    const refundsSucceeded = successfulRefunds.length;
    const eligibleForRefund = isPaid ? paidParticipants.length : 0;
    const refundsAttempted = isPaid ? refundResults.length : 0;
    
    // Verify all eligible participants were refunded (not just that successful refunds have receiptStatus === 1)
    // allRefundsConfirmed means: all eligible participants were successfully refunded AND all have receiptStatus === 1
    const allRefundsConfirmed = isPaid 
      ? (refundsSucceeded === eligibleForRefund && eligibleForRefund > 0 && successfulRefunds.every((r: any) => r.receiptStatus === 1))
      : true;
    
    safeLog('info', '[games][cancel] Game cancelled - final status', {
      correlationId,
      gameId,
      fid,
      isPaidGame: isPaid,
      participantsConsidered: allParticipants.length,
      eligibleForRefund,
      refundsAttempted,
      refundsSucceeded,
      allRefundsConfirmed,
      gitSha,
    });

    // ALWAYS include diagnostics for paid games (even for free games for debugging)
    const refundDetails = {
      isPaidGame: isPaid,
      participantsConsidered: allParticipants.length,
      eligibleForRefund,
      refundsAttempted,
      refundsSucceeded,
      refundTxs: refundResults ? refundResults.map((r: any) => ({
        fid: r.playerFid,
        participantId: r.participantId,
        address: r.address,
        addressSource: r.addressSource,
        refund_tx_hash: r.txHash,
        receiptStatus: r.receiptStatus,
        blockNumber: r.blockNumber,
        error: r.error,
      })) : [],
    };

    // Determine response status: ok:true only if eligibleForRefund === 0 OR refundsSucceeded === eligibleForRefund
    const allRefunded = isPaid ? (refundsSucceeded === eligibleForRefund && eligibleForRefund > 0) : true;
    const noRefundsNeeded = isPaid ? eligibleForRefund === 0 : true;
    const responseOk = noRefundsNeeded || allRefunded;
    
    // CRITICAL: Only say "all participants refunded" if we actually refunded all eligible
    const message = allRefunded && eligibleForRefund > 0
      ? 'Game cancelled and all participants refunded'
      : noRefundsNeeded
      ? 'Game cancelled (no refunds needed)'
      : `Game cancelled. ${refundsSucceeded}/${eligibleForRefund} refunds succeeded.`;

      if (!responseOk) {
      // Return error response when refunds failed - ALWAYS include diagnostics
      const errorResponseData = {
        gameId,
        ...(isPaid && { onchainGameId: (game as any).onchain_game_id || gameId }),
        ...refundDetails,
      };
      
      const response = NextResponse.json<ApiResponse<{
        gameId: string;
        onchainGameId?: string;
        participantsConsidered?: number;
        eligibleForRefund?: number;
        refundsAttempted?: number;
        refundsSucceeded?: number;
        refundTxs?: Array<{ fid: number; participantId?: string; address?: string; addressSource?: 'stored' | 'tx_from'; refund_tx_hash?: string | null; receiptStatus?: number; blockNumber?: number; error?: string }>;
      }>>({
        ok: false,
        error: message,
        data: errorResponseData,
      }, { status: 500 });
      response.headers.set('X-App-Version', gitSha);
      return response;
    }
    
    // ALWAYS include full diagnostic payload (even for free games during debugging)
    const responseData = {
      message,
      gameId,
      ...(isPaid && { onchainGameId: (game as any).onchain_game_id || gameId }),
      ...refundDetails,
    };
    
    const response = NextResponse.json<ApiResponse<{
      message: string;
      gameId: string;
      onchainGameId?: string;
      participantsConsidered?: number;
      eligibleForRefund?: number;
      refundsAttempted?: number;
      refundsSucceeded?: number;
      refundTxs?: Array<{ fid: number; participantId?: string; address?: string; addressSource?: 'stored' | 'tx_from'; refund_tx_hash?: string | null; receiptStatus?: number; blockNumber?: number; error?: string }>;
    }>>({
      ok: true,
      data: responseData,
    });
    response.headers.set('X-App-Version', gitSha);
    return response;
  } catch (error: any) {
    const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown';
    
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      const response = NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
      response.headers.set('X-App-Version', gitSha);
      return response;
    }
    // Handle permission errors
    if (error.message?.includes('owner') || error.message?.includes('permission')) {
      const response = NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
      response.headers.set('X-App-Version', gitSha);
      return response;
    }

    safeLog('error', '[games][cancel] Error cancelling game', {
      correlationId,
      gameId: (await params).id,
      error: error?.message || 'Unknown error',
      gitSha,
    });
    const response = NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to cancel game" },
      { status: 500 }
    );
    response.headers.set('X-App-Version', gitSha);
    return response;
  }
}


