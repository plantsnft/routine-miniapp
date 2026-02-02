import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getClubForGame, requireClubOwner } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { GAME_ESCROW_CONTRACT, BASE_RPC_URL, BASE_USDC_ADDRESS, BASE_CHAIN_ID, PRIZE_DISTRIBUTION_CONTRACT } from "~/lib/constants";
import { GAME_ESCROW_ABI, PRIZE_DISTRIBUTION_ABI } from "~/lib/contracts";
import { amountToUnits } from "~/lib/amounts";
import { logSettlementEvent } from "~/lib/audit-logger";
import { safeLog } from "~/lib/redaction";
import { verifyPaymentOnChain } from "~/lib/payment-verifier";
import { getBaseScanTxUrl } from "~/lib/explorer";
import type { ApiResponse, Game } from "~/lib/types";

/**
 * Handle settlement for giveaway wheel games
 * CRITICAL: Uses Neynar API for wallet addresses (no payment transactions)
 * CRITICAL: Uses PrizeDistribution contract (not GameEscrow)
 */
async function handleWheelGameSettlement(
  game: Game,
  gameId: string,
  fid: number
): Promise<NextResponse<ApiResponse>> {
  // Wheel games: winner is already determined
  const winnerFid = game.wheel_winner_fid;
  if (!winnerFid) {
    return NextResponse.json<ApiResponse>(
      { ok: false, error: 'Wheel not spun yet. Spin the wheel before settling.' },
      { status: 400 }
    );
  }

  // CRITICAL FIX: Use Neynar API for wallet address (no payment tx)
  const { getAllPlayerWalletAddresses } = await import('~/lib/neynar-wallet');
  const addresses = await getAllPlayerWalletAddresses(winnerFid);

  if (!addresses || addresses.length === 0) {
    return NextResponse.json<ApiResponse>(
      { ok: false, error: `Could not retrieve wallet address for winner FID ${winnerFid}` },
      { status: 400 }
    );
  }

  // Filter out known contract addresses
  const knownContracts = [
    GAME_ESCROW_CONTRACT?.toLowerCase(),
    BASE_USDC_ADDRESS.toLowerCase(),
  ].filter(Boolean);

  const walletAddresses = addresses.filter(addr =>
    !knownContracts.includes(addr.toLowerCase())
  );

  if (walletAddresses.length === 0) {
    return NextResponse.json<ApiResponse>(
      { ok: false, error: `No valid wallet address found for winner FID ${winnerFid}` },
      { status: 400 }
    );
  }

  const winnerAddress = walletAddresses[walletAddresses.length - 1]; // Prefer verified

  // Fetch prize configuration for position 1 only (wheel games always have one winner)
  const prizeConfig = await pokerDb.fetch('game_prizes', {
    filters: { game_id: gameId, winner_position: 1 },
    select: '*',
  });

  if (prizeConfig.length === 0) {
    return NextResponse.json<ApiResponse>(
      { ok: false, error: 'No prize configuration found for this game' },
      { status: 400 }
    );
  }

  // Separate token and NFT prizes
  const tokenPrizes: Array<{recipient: string, amount: bigint, currency: string}> = [];
  const nftPrizes: Array<{recipient: string, contract: string, tokenId: number}> = [];

  for (const prize of prizeConfig) {
    if (prize.token_amount) {
      tokenPrizes.push({
        recipient: winnerAddress,
        amount: amountToUnits(prize.token_amount, prize.token_currency || 'USDC'),
        currency: prize.token_currency || 'USDC',
      });
    }

    if (prize.nft_contract_address && prize.nft_token_id) {
      nftPrizes.push({
        recipient: winnerAddress,
        contract: prize.nft_contract_address,
        tokenId: prize.nft_token_id,
      });
    }
  }

  // CRITICAL FIX: Use PrizeDistribution contract (not GameEscrow)
  if (!PRIZE_DISTRIBUTION_CONTRACT) {
    return NextResponse.json<ApiResponse>(
      { ok: false, error: 'PrizeDistribution contract not configured' },
      { status: 500 }
    );
  }

  // Verify NFT ownership before distribution
  if (nftPrizes.length > 0) {
    const { verifyAllNFTsOwned } = await import('~/lib/nft-ops');
    const verification = await verifyAllNFTsOwned(
      nftPrizes.map(p => ({ contract: p.contract, tokenId: p.tokenId }))
    );

    if (!verification.allOwned) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `NFTs not in master wallet: ${JSON.stringify(verification.missing)}` },
        { status: 400 }
      );
    }
  }

  // Prepare master wallet signer
  const masterWalletPrivateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
  if (!masterWalletPrivateKey) {
    return NextResponse.json<ApiResponse>(
      { ok: false, error: 'Master wallet private key not configured' },
      { status: 500 }
    );
  }

  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const wallet = new ethers.Wallet(masterWalletPrivateKey, provider);

  const txHashes: string[] = [];

  // Distribute tokens
  if (tokenPrizes.length > 0) {
    const tokenContract = tokenPrizes[0].currency === 'USDC'
      ? BASE_USDC_ADDRESS
      : tokenPrizes[0].currency;

    const prizeContract = new ethers.Contract(
      PRIZE_DISTRIBUTION_CONTRACT,
      PRIZE_DISTRIBUTION_ABI,
      wallet
    );

    const recipients = tokenPrizes.map(p => p.recipient);
    const amounts = tokenPrizes.map(p => p.amount);

    try {
      const tx = await prizeContract.distributeTokens(
        gameId,
        tokenContract,
        recipients,
        amounts
      );
      await tx.wait();
      txHashes.push(tx.hash);
      safeLog('info', '[settle-contract] Token prizes distributed', {
        gameId,
        winnerFid,
        winnerAddress,
        txHash: tx.hash,
      });
    } catch (error: any) {
      safeLog('error', '[settle-contract] Failed to distribute token prizes', {
        gameId,
        winnerFid,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Failed to distribute token prizes: ${error.message}` },
        { status: 500 }
      );
    }
  }

  // Distribute NFTs
  if (nftPrizes.length > 0) {
    const prizeContract = new ethers.Contract(
      PRIZE_DISTRIBUTION_CONTRACT,
      PRIZE_DISTRIBUTION_ABI,
      wallet
    );

    const nftContracts = nftPrizes.map(p => p.contract);
    const nftTokenIds = nftPrizes.map(p => p.tokenId);
    const nftRecipients = nftPrizes.map(p => p.recipient);

    try {
      const tx = await prizeContract.distributeNFTs(
        gameId,
        nftContracts,
        nftTokenIds,
        nftRecipients
      );
      await tx.wait();
      txHashes.push(tx.hash);
      safeLog('info', '[settle-contract] NFT prizes distributed', {
        gameId,
        winnerFid,
        winnerAddress,
        txHash: tx.hash,
      });
    } catch (error: any) {
      safeLog('error', '[settle-contract] Failed to distribute NFT prizes', {
        gameId,
        winnerFid,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Failed to distribute NFT prizes: ${error.message}` },
        { status: 500 }
      );
    }
  }

  // Update game status
  await pokerDb.update('games', { id: gameId }, {
    status: 'completed',
    settled_at: new Date().toISOString(),
  });

  // Log settlement event
  await logSettlementEvent({
    gameId,
    actorFid: fid,
    winners: [{ fid: winnerFid, address: winnerAddress }],
    txHashes,
  });

  return NextResponse.json<ApiResponse<{
    winnerFid: number;
    winnerAddress: string;
    txHashes: string[];
  }>>({
    ok: true,
    data: {
      winnerFid,
      winnerAddress,
      txHashes,
    },
  });
}

/**
 * POST /api/games/[id]/settle-contract
 * Settle game and distribute payouts via contract (club owner or global admin only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * IDEMPOTENT: If game already settled, returns success (no-op)
 * INVARIANT: Prevents settle if any unpaid participants (unless explicit override for admin)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // Admin gate: global admin OR club owner
    const clubId = await getClubForGame(gameId);
    if (!clubId) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }
    
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
    }

    if (!GAME_ESCROW_CONTRACT) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Escrow contract not configured" },
        { status: 500 }
      );
    }

    // Fetch game - use pokerDb (explicit select to avoid non-existent columns)
    // Production schema: id, club_id, status, buy_in_amount, buy_in_currency, onchain_game_id, settle_tx_hash, payout_bps
    // NO reward_currency, NO entry_fee_currency, NO entry_fee_amount columns exist
    let games;
    try {
      games = await pokerDb.fetch<Game>('games', {
        filters: { id: gameId },
        select: 'id,club_id,status,buy_in_amount,buy_in_currency,onchain_game_id,settle_tx_hash,payout_bps,game_type,wheel_winner_fid',
        limit: 1,
      });
    } catch (dbError: any) {
      const errorMessage = dbError?.message || String(dbError);
      // Check for Supabase schema mismatch error (42703)
      if (errorMessage.includes('42703') || errorMessage.includes('does not exist')) {
        const selectUsed = 'id,club_id,status,buy_in_amount,buy_in_currency,onchain_game_id,settle_tx_hash,payout_bps,game_type,wheel_winner_fid';
        safeLog('error', '[settle-contract] DB schema mismatch', { gameId, errorMessage, selectUsed });
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `DB schema mismatch: missing column. Select used: ${selectUsed}`,
            dbError: errorMessage,
          },
          { status: 409 }
        );
      }
      // Re-throw other DB errors
      throw dbError;
    }

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const game = games[0];

    // CRITICAL FIX: Handle wheel games differently (before existing settlement logic)
    if (game.game_type === 'giveaway_wheel') {
      return await handleWheelGameSettlement(game, gameId, fid);
    }

    // PRECEDENCE: IDEMPOTENCY - If already settled, return success (no-op)
    if (game.status === 'completed' || game.status === 'settled') {
      safeLog('info', '[settle-contract] Idempotent settle request - already settled', {
        gameId,
        fid,
        gameStatus: game.status,
      });
      return NextResponse.json<ApiResponse<{
        settleTxHash: string | null;
        settleTxUrl: string | null;
        txUrls: string[];
        recipients: string[];
        amounts: string[];
        message: string;
      }>>({
        ok: true,
        data: {
          settleTxHash: null,
          settleTxUrl: null,
          txUrls: [],
          recipients: [],
          amounts: [],
          message: 'Game already settled',
        },
      });
    }

    // INVARIANT: Check for unpaid participants (unless allowUnpaid=true for admin)
    // A participant is considered "paid" if they have:
    // - status === 'paid' OR payment_status === 'paid' OR
    // - status === 'joined' AND tx_hash is not null/empty (they've paid on-chain)
    const body = await req.json();
    const { winnerFids: winnerFidsRaw, recipients, amounts, allowUnpaid } = body;

    // Parse and normalize winnerFids - make it the source of truth for payout count
    const winnerFidsParsed = Array.isArray(winnerFidsRaw)
      ? winnerFidsRaw.map(Number).filter(Number.isFinite)
      : [];
    
    // Deduplicate winnerFids - don't allow the same FID twice
    const uniqueWinnerFids = [...new Set(winnerFidsParsed)];
    if (winnerFidsParsed.length !== uniqueWinnerFids.length) {
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: `Duplicate FIDs in winnerFids array. Each winner must be unique.`,
          mode: 'winnerFids',
          winnerFidsParsed: winnerFidsParsed,
          uniqueWinnerFids,
          duplicatesFound: true,
        },
        { status: 400 }
      );
    }

    const winnerFids = uniqueWinnerFids;
    
    // Determine mode - winnerFids array length determines payout count
    const mode: 'winnerFids' | 'legacy' = winnerFids.length > 0 ? 'winnerFids' : 'legacy';

    // Log request payload for diagnostics (gated behind auth, server logs only)
    safeLog('info', '[settle-contract] Settlement request', {
      gameId,
      fid,
      mode,
      winnerFidsParsed: mode === 'winnerFids' ? winnerFids : undefined,
      gamePayoutBps: mode === 'winnerFids' ? ((game as any).payout_bps || null) : undefined,
      recipientsCount: mode === 'legacy' && recipients ? recipients.length : undefined,
      amountsCount: mode === 'legacy' && amounts ? amounts.length : undefined,
    });

    if (!allowUnpaid || !isGlobalAdmin(fid)) {
      const allParticipants = await pokerDb.fetch('participants', {
        filters: { game_id: gameId },
        select: 'id,fid,status,tx_hash',
      });
      
      // Log for debugging
      safeLog('info', '[settle-contract] Checking unpaid participants', {
        gameId,
        totalParticipants: allParticipants.length,
        participants: allParticipants.map((p: any) => ({
          id: p.id,
          fid: p.fid,
          status: p.status,
          hasTxHash: !!p.tx_hash,
          txHash: p.tx_hash ? `${p.tx_hash.substring(0, 10)}...` : null,
        })),
      });
      
      const unpaidParticipants = allParticipants.filter((p: any) => {
        // Consider paid if: status is 'paid' or has tx_hash (joined with payment)
        // Handle tx_hash being null, undefined, or empty string
        const hasTxHash = p.tx_hash && p.tx_hash.trim().length > 0;
        const isPaid = p.status === 'paid' || (p.status === 'joined' && hasTxHash);
        return !isPaid && p.status !== 'refunded';
      });
      
      if (unpaidParticipants.length > 0) {
        safeLog('warn', '[settle-contract] Unpaid participants found, blocking settlement', {
          gameId,
          unpaidCount: unpaidParticipants.length,
          unpaid: unpaidParticipants.map((p: any) => ({
            id: p.id,
            fid: p.fid,
            status: p.status,
            hasTxHash: !!p.tx_hash,
          })),
        });
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `Cannot settle game with ${unpaidParticipants.length} unpaid participant(s). All participants must be paid before settling.` 
          },
          { status: 400 }
        );
      }
    }

    // NEW PATHWAY: If winnerFids provided, derive addresses and calculate amounts server-side
    // OLD PATHWAY: If recipients/amounts provided, use them directly (backward compatibility)
    let finalRecipients: string[] = [];
    let finalAmounts: bigint[] = [];
    const winnerFidToAddressMap: Map<number, string> = new Map(); // For payout updates
    let payoutBpsUsed: number[] = [10000]; // Default to winner-take-all, will be set in winnerFids pathway
    
    if (mode === 'winnerFids') {
      // NEW PATHWAY: Derive addresses from payment transactions and use contract totalCollected
      
      if (winnerFids.length === 0) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: 'winnerFids required (must be non-empty array of numbers)',
            mode: 'winnerFids',
            winnerFidsReceived: winnerFidsRaw,
            winnerFidsParsed: [],
          },
          { status: 400 }
        );
      }

      // Load all participants for the game, then filter by winner FIDs
      // (pokerDb.fetch doesn't support array filters, so we filter in JS)
      const allParticipantsForGame = await pokerDb.fetch('participants', {
        filters: { game_id: gameId },
        select: 'id,fid,status,tx_hash',
      });

      const winnerFidsSet = new Set(winnerFids);
      const winnerParticipants = allParticipantsForGame.filter((p: any) => 
        winnerFidsSet.has(p.fid)
      );

      if (winnerParticipants.length !== winnerFids.length) {
        const foundFids = winnerParticipants.map((p: any) => p.fid);
        const missingFids = winnerFids.filter(fid => !foundFids.includes(fid));
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `One or more winner participants not found. Missing FIDs: ${missingFids.join(', ')}`,
            mode: 'winnerFids',
            winnerFidsParsed: winnerFids,
            foundFids,
            missingFids,
          },
          { status: 409 }
        );
      }

      // Verify each winner has paid and derive their payment address
      // Database uses buy_in_amount (map to entry_fee_amount for Game type compatibility)
      const entryFeeAmount = parseFloat(String((game as any).buy_in_amount || 0));
      const winnerAddresses: string[] = [];
      
      for (const participant of winnerParticipants as any[]) {
        // Verify participant has paid
        const hasTxHash = participant.tx_hash && participant.tx_hash.trim().length > 0;
        const isPaid = participant.status === 'paid' || (participant.status === 'joined' && hasTxHash);
        
        if (!isPaid) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: `Participant FID ${participant.fid} has not paid (status: ${participant.status}, hasTxHash: ${hasTxHash})` },
            { status: 400 }
          );
        }

        // Derive address from payment transaction (same pattern as refund flow)
        const paymentVerification = await verifyPaymentOnChain({
          paymentTxHash: participant.tx_hash,
          expectedEscrowAddress: GAME_ESCROW_CONTRACT!,
          expectedUsdcAddress: BASE_USDC_ADDRESS,
          expectedAmount: entryFeeAmount,
          chainId: BASE_CHAIN_ID,
        });

        if (!paymentVerification.success) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: `Payment verification failed for FID ${participant.fid}: ${paymentVerification.error}` },
            { status: 400 }
          );
        }

        winnerAddresses.push(paymentVerification.payerAddress);
        winnerFidToAddressMap.set(participant.fid, paymentVerification.payerAddress);
      }

      // Store addresses for later (amounts will be calculated after contract state check)
      finalRecipients = winnerAddresses;

      safeLog('info', '[settle-contract] Winner addresses derived from payment transactions', {
        gameId,
        winnerCount: winnerFids.length,
        winnerAddresses,
      });

    } else if (recipients && amounts && Array.isArray(recipients) && Array.isArray(amounts)) {
      // OLD PATHWAY: Backward compatibility (direct recipients/amounts)
      if (recipients.length !== amounts.length) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Recipients and amounts arrays must have same length" },
          { status: 400 }
        );
      }

      // Validate addresses
      const recipientAddresses = recipients.filter(addr => ethers.isAddress(addr));
      if (recipientAddresses.length !== recipients.length) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Invalid recipient addresses found" },
          { status: 400 }
        );
      }

      // Convert amounts using centralized helper
      // Production schema only has buy_in_currency (no reward_currency or entry_fee_currency)
      const currency = ((game as any).buy_in_currency || 'USDC') as 'ETH' | 'USDC';
      finalRecipients = recipientAddresses;
      finalAmounts = amounts.map((amt: string | number) => {
        const amtNum = typeof amt === 'string' ? parseFloat(amt) : amt;
        if (isNaN(amtNum) || amtNum < 0) {
          throw new Error(`Invalid amount: ${amt}`);
        }
        const rawUnits = amountToUnits(amtNum, currency);
        return BigInt(rawUnits);
      });
    } else {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Must provide either winnerFids array or recipients/amounts arrays" },
        { status: 400 }
      );
    }

    // Get currency type for proper amount conversion (for audit logging)
    // Production schema only has buy_in_currency (no reward_currency or entry_fee_currency)
    const currency = ((game as any).buy_in_currency || 'USDC') as 'ETH' | 'USDC';

    // Prepare contract and provider
    const masterWalletPrivateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
    if (!masterWalletPrivateKey) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Master wallet private key not configured" },
        { status: 500 }
      );
    }

    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const wallet = new ethers.Wallet(masterWalletPrivateKey, provider);
    const contract = new ethers.Contract(
      GAME_ESCROW_CONTRACT!,
      GAME_ESCROW_ABI,
      wallet
    );

    // DIAGNOSTICS: Always fetch contract state before attempting settlement
    let contractState: {
      contractGameId: string;
      currency: string;
      entryFee: string;
      totalCollected: string;
      isActive: boolean;
      isSettled: boolean;
    };

    try {
      const gameState = await contract.getGame(gameId);
      contractState = {
        contractGameId: gameState.gameId,
        currency: gameState.currency,
        entryFee: gameState.entryFee.toString(),
        totalCollected: gameState.totalCollected.toString(),
        isActive: gameState.isActive,
        isSettled: gameState.isSettled,
      };
    } catch (contractStateError: any) {
      console.error('[settle-contract] Failed to fetch contract state', {
        gameId,
        error: contractStateError?.message || 'Unknown error',
      });
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: `Failed to fetch contract state for gameId: ${contractStateError?.message || 'Unknown error'}`,
          contractState: null,
          debugHints: [
            'Game may not be initialized on-chain for this gameId',
            'Check if game creation step calls escrow contract createGame()',
            'Verify gameId string matches what was used during on-chain game creation',
          ],
        },
        { status: 409 }
      );
    }

    // DIAGNOSTICS: Payment transaction sanity check
    let paymentTxDiagnostics: {
      paymentTxTo: string | null;
      paymentTxFrom: string | null;
      paymentTxHash: string | null;
      wentToEscrow: boolean;
      wentToUsdcDirect: boolean;
    } | null = null;

    try {
      // Pick first paid participant with tx_hash for diagnostic check
      const allParticipantsForDiagnostics = await pokerDb.fetch('participants', {
        filters: { game_id: gameId },
        select: 'id,fid,status,tx_hash',
      });

      const paidParticipant = allParticipantsForDiagnostics.find((p: any) => {
        const hasTxHash = p.tx_hash && p.tx_hash.trim().length > 0;
        return hasTxHash && (p.status === 'paid' || p.status === 'joined');
      });

      if (paidParticipant && (paidParticipant as any).tx_hash) {
        const paymentTx = await provider.getTransaction((paidParticipant as any).tx_hash);
        if (paymentTx) {
          const txTo = paymentTx.to?.toLowerCase() || null;
          const escrowLower = GAME_ESCROW_CONTRACT!.toLowerCase();
          const usdcLower = BASE_USDC_ADDRESS.toLowerCase();

          paymentTxDiagnostics = {
            paymentTxTo: txTo,
            paymentTxFrom: paymentTx.from?.toLowerCase() || null,
            paymentTxHash: (paidParticipant as any).tx_hash,
            wentToEscrow: txTo === escrowLower,
            wentToUsdcDirect: txTo === usdcLower,
          };
        }
      }
    } catch (paymentTxError: any) {
      // Non-critical: log but don't fail
      safeLog('warn', '[settle-contract] Failed to fetch payment tx for diagnostics', {
        gameId,
        error: paymentTxError?.message,
      });
    }

    // VALIDATION: Check contract state before attempting settlement
    if (!contractState.isActive) {
      const debugHints = [
        'Contract has no active game for this gameId',
        'Likely causes:',
        '  - gameId string mismatch (DB gameId vs on-chain gameId)',
        '  - Game was never initialized on-chain (createGame() not called)',
        '  - Game was cancelled/deactivated on-chain',
      ];

      if (paymentTxDiagnostics?.wentToUsdcDirect) {
        debugHints.push(
          '  - Payments were direct USDC transfers (not via escrow contract)',
          '  - Escrow contract requires joinGame() calls, not direct USDC transfers',
          '  - Settlement requires on-chain game state under gameId'
        );
      }

      const requestedPayoutTotalForError = finalAmounts.length > 0 
        ? finalAmounts.reduce((sum, amt) => sum + amt, 0n).toString()
        : '0';

      console.error('[settle-contract] Game not active in contract', {
        gameId,
        contractState,
        requestedPayoutTotal: requestedPayoutTotalForError,
        recipientsCount: finalRecipients.length,
        paymentTxDiagnostics,
      });

      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Contract has no active game for this gameId. Likely gameId mismatch or game never initialized on-chain.',
          contractState,
          paymentTxDiagnostics,
          requestedPayoutTotal: requestedPayoutTotalForError,
          requestedPayouts: finalAmounts.length > 0 ? finalAmounts.map(a => a.toString()) : [],
          debugHints,
        },
        { status: 409 }
      );
    }

    if (contractState.isSettled) {
      console.error('[settle-contract] Game already settled in contract', {
        gameId,
        contractState,
      });

      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Game already settled on-chain',
          mode,
          contractState,
          paymentTxDiagnostics,
          winnerFidsParsed: mode === 'winnerFids' ? winnerFids : undefined,
        },
        { status: 409 }
      );
    }

    // If using new pathway (winnerFids), calculate amounts from contract totalCollected now
    if (mode === 'winnerFids') {
      const totalCollected = BigInt(contractState.totalCollected);

      // Split pot using integer math (guarantees sum === totalCollected)
      function splitPot(total: bigint, n: number): bigint[] {
        if (n <= 0) throw new Error("n must be > 0");
        const N = BigInt(n);
        const base = total / N;
        const rem = total % N;
        return Array.from({ length: n }, (_, i) => base + (BigInt(i) < rem ? 1n : 0n));
      }

      // Load payout_bps from game configuration (stored at game creation)
      // Source of truth: game.payout_bps (ignore any request.payoutBps entirely)
      const gamePayoutBps = (game as any).payout_bps;
      
      // Default to [10000] (winner-take-all) if payout_bps is null/undefined
      payoutBpsUsed = (gamePayoutBps && Array.isArray(gamePayoutBps) && gamePayoutBps.length > 0)
        ? gamePayoutBps.map(Number).filter(Number.isFinite)
        : [10000]; // Default to winner-take-all
      
      // Validate winner count matches payout structure from game config
      const requiredWinners = payoutBpsUsed.length;
      
      if (gamePayoutBps && Array.isArray(gamePayoutBps) && gamePayoutBps.length > 0) {
        // Validate payout_bps structure (already normalized above, but double-check)
        if (payoutBpsUsed.length !== gamePayoutBps.length) {
          return NextResponse.json<ApiResponse>(
            { 
              ok: false, 
              error: `Invalid payout_bps in game config: must be array of numbers`,
              mode: 'winnerFids',
              winnerFidsParsed: winnerFids,
              requiredWinners,
              payoutBpsFromDb: payoutBpsUsed,
            },
            { status: 400 }
          );
        }

        // Validate winner count matches payout structure length
        if (winnerFids.length !== requiredWinners) {
          return NextResponse.json<ApiResponse>(
            { 
              ok: false, 
              error: `Game requires exactly ${requiredWinners} winner(s) based on payout structure (payout_bps length), but ${winnerFids.length} provided`,
              mode: 'winnerFids',
              winnerFidsParsed: winnerFids,
              requiredWinners,
              payoutBpsFromDb: payoutBpsUsed,
            },
            { status: 400 }
          );
        }

        // Validate: all values must be integers >= 0
        if (payoutBpsUsed.some(bps => !Number.isInteger(bps) || bps < 0)) {
          return NextResponse.json<ApiResponse>(
            { 
              ok: false, 
              error: `Invalid payout_bps in game config: must contain non-negative integers only`,
              mode: 'winnerFids',
              winnerFidsParsed: winnerFids,
              requiredWinners,
              payoutBpsFromDb: payoutBpsUsed,
            },
            { status: 400 }
          );
        }

        // Validate: sum must equal 10000 exactly
        const totalBps = payoutBpsUsed.reduce((sum, bps) => sum + bps, 0);
        if (totalBps !== 10000) {
          return NextResponse.json<ApiResponse>(
            { 
              ok: false, 
              error: `Invalid payout_bps in game config: must sum to exactly 10000 (100%), but got ${totalBps}`,
              mode: 'winnerFids',
              winnerFidsParsed: winnerFids,
              requiredWinners,
              payoutBpsFromDb: payoutBpsUsed,
              totalBps,
            },
            { status: 400 }
          );
        }
      }
      
      // Enforce winner count matches payout structure (for all cases, including default [10000])
      if (winnerFids.length !== requiredWinners) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `Game requires exactly ${requiredWinners} winner(s) based on payout structure (payout_bps length), but ${winnerFids.length} provided`,
            mode: 'winnerFids',
            winnerFidsParsed: winnerFids,
            requiredWinners,
            payoutBpsFromDb: payoutBpsUsed,
          },
          { status: 400 }
        );
      }

      // Calculate amounts using integer math: amount[i] = (totalCollected * bps[i]) / 10000
      // Distribute remainder to first payout to ensure sum === totalCollected
      const calculatedAmounts = payoutBpsUsed.map((bps) => {
        // (totalCollected * bps) / 10000, using integer division
        return (totalCollected * BigInt(bps)) / 10000n;
      });

        // Calculate remainder to ensure sum === totalCollected
        const calculatedTotal = calculatedAmounts.reduce((sum, amt) => sum + amt, 0n);
        const remainder = totalCollected - calculatedTotal;
        if (remainder > 0n) {
          // Add remainder to first payout (rounding favor first place)
          calculatedAmounts[0] = calculatedAmounts[0] + remainder;
        }

      finalAmounts = calculatedAmounts;

      safeLog('info', '[settle-contract] Using payout structure from game config (payout_bps)', {
        gameId,
        winnerCount: winnerFids.length,
        payoutBps: payoutBpsUsed,
        totalBps: payoutBpsUsed.reduce((sum, bps) => sum + bps, 0),
        amounts: finalAmounts.map(a => a.toString()),
        requestedTotal: finalAmounts.reduce((sum, amt) => sum + amt, 0n).toString(),
        totalCollected: totalCollected.toString(),
        recipients: finalRecipients,
      });

      // Preflight check: recipients and amounts arrays must match payout structure length
      if (finalRecipients.length !== finalAmounts.length || finalAmounts.length !== payoutBpsUsed.length) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `Mismatched array lengths: recipients.length=${finalRecipients.length}, amounts.length=${finalAmounts.length}, payoutBps.length=${payoutBpsUsed.length}. All must be equal.`,
            mode,
            recipientsCount: finalRecipients.length,
            amountsCount: finalAmounts.length,
            payoutBpsLength: payoutBpsUsed.length,
            winnerFidsParsed: winnerFids,
            payoutBpsFromDb: payoutBpsUsed,
          },
          { status: 400 }
        );
      }
      
      // Preflight check: requestedTotal must equal totalCollected in winnerFids mode (exact match)
      const requestedTotal = finalAmounts.reduce((sum, amt) => sum + amt, 0n);
      if (requestedTotal !== totalCollected) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `Requested payout total (${requestedTotal.toString()}) must equal contract totalCollected (${totalCollected.toString()})`,
            mode,
            contractState,
            paymentTxDiagnostics,
            requestedPayoutTotal: requestedTotal.toString(),
            requestedPayouts: finalAmounts.map(a => a.toString()),
            recipientsCount: finalRecipients.length,
            amountsCount: finalAmounts.length,
            winnerFidsParsed: winnerFids,
            payoutBpsFromDb: payoutBpsUsed,
          },
          { status: 400 }
        );
      }

      safeLog('info', '[settle-contract] Pot split calculated from contract totalCollected', {
        gameId,
        mode,
        totalCollected: totalCollected.toString(),
        requestedTotal: requestedTotal.toString(),
        amounts: finalAmounts.map(a => a.toString()),
        recipients: finalRecipients,
        winnerFidsParsed: winnerFids,
      });
    }

    // Calculate requested payout total for logging/diagnostics
    const requestedPayoutTotal = finalAmounts.reduce((sum, amt) => sum + amt, 0n);
    const requestedPayouts = finalAmounts.map(a => a.toString());

    // Log before attempting settlement
    console.log('[settle-contract] Pre-settlement state', {
      gameId,
      mode,
      contractState,
      requestedPayoutTotal: requestedPayoutTotal.toString(),
      recipientsCount: finalRecipients.length,
      amountsCount: finalAmounts.length,
      recipients: finalRecipients,
      amounts: requestedPayouts,
      winnerFidsParsed: mode === 'winnerFids' ? winnerFids : undefined,
    });

    // Attempt settlement
    let settleTxHash: string;
    try {
      safeLog('info', '[settle-contract] Calling contract.settleGame', {
        gameId,
        fid,
        mode,
        recipientCount: finalRecipients.length,
        amountsCount: finalAmounts.length,
        amounts: requestedPayouts,
        contractState,
        winnerFidsParsed: mode === 'winnerFids' ? winnerFids : undefined,
      });
      const tx = await contract.settleGame(gameId, finalRecipients, finalAmounts);
      safeLog('info', '[settle-contract] Transaction sent, waiting for confirmation', {
        gameId,
        fid,
        txHash: tx.hash,
      });
      const receipt = await tx.wait();
      
      if (!receipt || !receipt.hash) {
        throw new Error("Transaction failed: no receipt");
      }

      settleTxHash = receipt.hash;

      // Fetch contract state after settlement for post-state diagnostics (do this BEFORE DB update)
      let postContractState = contractState;
      try {
        const postGameState = await contract.getGame(gameId);
        postContractState = {
          contractGameId: postGameState.gameId,
          currency: postGameState.currency,
          entryFee: postGameState.entryFee.toString(),
          totalCollected: postGameState.totalCollected.toString(),
          isActive: postGameState.isActive,
          isSettled: postGameState.isSettled,
        };
      } catch (postStateError: any) {
        safeLog('warn', '[settle-contract] Failed to fetch post-settlement contract state', {
          gameId,
          error: postStateError?.message,
        });
      }

      safeLog('info', '[settle-contract] Transaction confirmed', {
        gameId,
        fid,
        settleTxHash,
        postContractState,
      });

      // AUDIT TRAIL: Log settlement event (contains actor_fid, action, game_id, tx_hash, timestamp)
      // Convert amounts back to human-readable for audit log
      const amountsForAudit = finalAmounts.map(amt => {
        // Convert from USDC base units (6 decimals) to human-readable
        const amountStr = amt.toString();
        const wholePart = amountStr.slice(0, -6) || '0';
        const decimalPart = amountStr.slice(-6).padStart(6, '0');
        return `${wholePart}.${decimalPart}`;
      });

      const settledAt = new Date().toISOString();

      try {
        await logSettlementEvent({
          gameId,
          clubId: game.club_id,
          callerFid: fid, // actor_fid
          recipients: finalRecipients,
          amounts: amountsForAudit,
          currency,
          txHash: settleTxHash,
          timestamp: settledAt,
        });
      } catch (auditLogError: any) {
        // Non-critical: log but don't fail
        safeLog('warn', '[settle-contract] Failed to log settlement event', {
          gameId,
          error: auditLogError?.message,
        });
      }

      // Update game status and store settlement tx hash - use pokerDb
      // Only update columns that exist: status, settle_tx_hash (NO settled_at)
      try {
        await pokerDb.update<Game>('games',
          { id: gameId },
          {
            status: 'settled',
            settle_tx_hash: settleTxHash,
          } as any
        );
      } catch (dbUpdateError: any) {
        // DB update failed, but on-chain settlement succeeded
        // Return error with settleTxHash so caller can verify on-chain
        console.error('[settle-contract] DB update failed after on-chain settlement', {
          gameId,
          settleTxHash,
          error: dbUpdateError?.message,
          postContractState,
        });

        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: `DB update failed after on-chain settlement: ${dbUpdateError?.message || 'Unknown error'}`,
            mode,
            settleTxHash,
            contractState: postContractState,
            paymentTxDiagnostics,
            recipients: finalRecipients,
            amounts: requestedPayouts,
            winnerFidsParsed: mode === 'winnerFids' ? winnerFids : undefined,
          },
          { status: 500 }
        );
      }

      // Update participant rows with payout information
      try {
        if (winnerFidToAddressMap.size > 0) {
          // NEW PATHWAY: Use winnerFidToAddressMap to update participants
          const recipientAmountMap = new Map<string, bigint>();
          for (let i = 0; i < finalRecipients.length; i++) {
            recipientAmountMap.set(finalRecipients[i].toLowerCase(), finalAmounts[i]);
          }

          // Update each winner participant
          for (const [winnerFid, winnerAddress] of winnerFidToAddressMap.entries()) {
            const payoutAmountBigInt = recipientAmountMap.get(winnerAddress.toLowerCase());
            if (payoutAmountBigInt !== undefined) {
              // Convert from USDC base units (6 decimals) to human-readable
              const amountStr = payoutAmountBigInt.toString();
              const wholePart = amountStr.slice(0, -6) || '0';
              const decimalPart = amountStr.slice(-6).padStart(6, '0');
              const payoutAmountDecimal = parseFloat(`${wholePart}.${decimalPart}`);

              await pokerDb.update('participants',
                { game_id: gameId, fid: winnerFid },
                {
                  payout_tx_hash: settleTxHash,
                  payout_amount: payoutAmountDecimal,
                  paid_out_at: settledAt,
                  status: 'settled',
                } as any
              );

              safeLog('info', '[settle-contract] Updated participant payout (new pathway)', {
                gameId,
                winnerFid,
                payoutAmountDecimal,
                settleTxHash,
              });
            }
          }
        } else {
          // OLD PATHWAY: Backward compatibility - map addresses to FIDs (less reliable)
          const { getPlayerWalletAddress } = await import('~/lib/neynar-wallet');
          const allParticipants = await pokerDb.fetch('participants', {
            filters: { game_id: gameId },
            select: 'id,fid',
          });

          const recipientAmountMap = new Map<string, bigint>();
          for (let i = 0; i < finalRecipients.length; i++) {
            recipientAmountMap.set(finalRecipients[i].toLowerCase(), finalAmounts[i]);
          }

          // For each participant, get their wallet address and check if they're in the recipients list
          for (const participant of allParticipants) {
            try {
              const participantFid = (participant as any).fid;
              const walletAddress = await getPlayerWalletAddress(participantFid);
              if (walletAddress && ethers.isAddress(walletAddress)) {
                const normalizedAddress = walletAddress.toLowerCase();
                const payoutAmountBigInt = recipientAmountMap.get(normalizedAddress);
                if (payoutAmountBigInt !== undefined) {
                  // Convert from base units to human-readable
                  const amountStr = payoutAmountBigInt.toString();
                  const wholePart = amountStr.slice(0, -6) || '0';
                  const decimalPart = amountStr.slice(-6).padStart(6, '0');
                  const payoutAmountDecimal = parseFloat(`${wholePart}.${decimalPart}`);

                  await pokerDb.update('participants',
                    { id: participant.id },
                    {
                      payout_tx_hash: settleTxHash,
                      payout_amount: payoutAmountDecimal,
                      paid_out_at: settledAt,
                      status: 'settled',
                    } as any
                  );

                  safeLog('info', '[settle-contract] Updated participant payout (old pathway)', {
                    gameId,
                    participantFid,
                    payoutAmountDecimal,
                    settleTxHash,
                  });
                }
              }
            } catch (participantError: any) {
              // Log but don't fail settlement if we can't update a participant
              safeLog('warn', '[settle-contract] Failed to update participant payout', {
                gameId,
                participantId: participant.id,
                error: participantError?.message || 'Unknown error',
              });
            }
          }
        }
      } catch (payoutUpdateError: any) {
        // Log but don't fail settlement if payout participant updates fail
        safeLog('warn', '[settle-contract] Failed to update participant payouts', {
          gameId,
          error: payoutUpdateError?.message || 'Unknown error',
        });
      }
    } catch (contractError: any) {
      const errorMessage = contractError?.reason || contractError?.message || 'Unknown error';
      console.error('[settle-contract] Contract settlement failed', {
        gameId,
        error: errorMessage,
        contractState,
        requestedPayoutTotal: requestedPayoutTotal.toString(),
        recipientsCount: finalRecipients.length,
        paymentTxDiagnostics,
      });

      // Determine if this is a "game not active" type error
      const isGameNotActiveError = 
        errorMessage.toLowerCase().includes('not active') ||
        errorMessage.toLowerCase().includes('game not active');

      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: `Contract settlement failed: ${errorMessage}`,
          contractState,
          paymentTxDiagnostics,
          requestedPayoutTotal: requestedPayoutTotal.toString(),
          requestedPayouts: finalAmounts.map(a => a.toString()),
          debugHints: isGameNotActiveError ? [
            'Contract reports game is not active',
            'Check contract state: isActive should be true',
            'Verify gameId matches what was used during on-chain game creation',
          ] : undefined,
        },
        { status: 500 }
      );
    }

    // Convert amounts to strings for response (human-readable)
    const amountsForResponse = finalAmounts.map(amt => {
      const amountStr = amt.toString();
      const wholePart = amountStr.slice(0, -6) || '0';
      const decimalPart = amountStr.slice(-6).padStart(6, '0');
      return `${wholePart}.${decimalPart}`;
    });

    // Fetch final contract state for response
    let finalContractState = contractState;
    try {
      const finalGameState = await contract.getGame(gameId);
      finalContractState = {
        contractGameId: finalGameState.gameId,
        currency: finalGameState.currency,
        entryFee: finalGameState.entryFee.toString(),
        totalCollected: finalGameState.totalCollected.toString(),
        isActive: finalGameState.isActive,
        isSettled: finalGameState.isSettled,
      };
    } catch (finalStateError: any) {
      safeLog('warn', '[settle-contract] Failed to fetch final contract state', {
        gameId,
        error: finalStateError?.message,
      });
    }

    // Build payout breakdown for UI (include fid, recipient address, amount, bps, and amountBaseUnits)
    const payoutBreakdown = mode === 'winnerFids' && winnerFids.length > 0
      ? winnerFids.map((fid, idx) => {
          const recipient = finalRecipients[idx];
          const amountDecimal = amountsForResponse[idx];
          const amountBaseUnits = finalAmounts[idx].toString();
          const bps = idx < payoutBpsUsed.length ? payoutBpsUsed[idx] : undefined;
          return {
            fid,
            recipient,
            amountDecimal,
            amountBaseUnits,
            bps,
          };
        })
      : finalRecipients.map((recipient, idx) => ({
          recipient,
          amountDecimal: amountsForResponse[idx],
          amountBaseUnits: finalAmounts[idx].toString(),
          bps: idx < payoutBpsUsed.length ? payoutBpsUsed[idx] : undefined,
        }));

    return NextResponse.json<ApiResponse<{
      settleTxHash: string;
      settleTxUrl: string | undefined;
      txUrls: string[];
      recipients: string[];
      amounts: string[];
      payouts: Array<{ fid?: number; recipient: string; amountDecimal: string; amountBaseUnits: string; bps?: number }>;
      contractState: typeof contractState;
    }>>({
      ok: true,
      data: {
        settleTxHash,
        settleTxUrl: getBaseScanTxUrl(settleTxHash) ?? undefined,
        txUrls: [getBaseScanTxUrl(settleTxHash)].filter((u): u is string => !!u),
        recipients: finalRecipients,
        amounts: amountsForResponse,
        payouts: payoutBreakdown,
        contractState: finalContractState,
      },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('owner') || error.message?.includes('permission')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][games][settle-contract] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to settle game" },
      { status: 500 }
    );
  }
}
