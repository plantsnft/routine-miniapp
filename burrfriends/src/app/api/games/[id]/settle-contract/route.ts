import { NextRequest, NextResponse, after } from "next/server";
import { ethers } from "ethers";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getClubForGame, requireClubOwner } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { GAME_ESCROW_CONTRACT, BASE_RPC_URL, BASE_USDC_ADDRESS, BASE_CHAIN_ID, APP_URL } from "~/lib/constants";
import { GAME_ESCROW_ABI } from "~/lib/contracts";
import { amountToUnits } from "~/lib/amounts";
import { logSettlementEvent } from "~/lib/audit-logger";
import { safeLog } from "~/lib/redaction";
import { verifyPaymentOnChain } from "~/lib/payment-verifier";
import { mapCurrencyToAddress, getCurrencyDecimals } from "~/lib/contract-ops";
import { getBaseScanTxUrl, getBaseScanTxUrls } from "~/lib/explorer";
import { sendNotificationToFid } from "~/lib/notifications";
import { formatPrizeAmount } from "~/lib/format-prize";
import type { ApiResponse, Game } from "~/lib/types";

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
    // Phase 4: Also select prize_amounts, number_of_winners, prize_currency for prize-based games
    // NO reward_currency, NO entry_fee_currency, NO entry_fee_amount columns exist
    let games;
    try {
      games = await pokerDb.fetch<Game>('burrfriends_games', {
        filters: { id: gameId },
        select: 'id,club_id,status,buy_in_amount,buy_in_currency,onchain_game_id,settle_tx_hash,payout_bps,prize_amounts,number_of_winners,prize_currency,game_type,max_participants,apply_staking_multipliers,double_payout_if_bb,is_preview',
        limit: 1,
      });
    } catch (dbError: any) {
      const errorMessage = dbError?.message || String(dbError);
      // Check for Supabase schema mismatch error (42703)
      if (errorMessage.includes('42703') || errorMessage.includes('does not exist')) {
        const selectUsed = 'id,club_id,status,buy_in_amount,buy_in_currency,onchain_game_id,settle_tx_hash,payout_bps';
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
    const { winnerFids: winnerFidsRaw, recipients, amounts, allowUnpaid, lastPersonStandingFid, lastPersonStandingAwardAmount } = body;

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

    // Phase 4.0: Determine if this is a prize-based game
    const isPrizeBasedGame = (game as any).buy_in_amount === 0 || 
                             (game as any).buy_in_amount === null ||
                             ((game as any).prize_amounts && Array.isArray((game as any).prize_amounts));

    if (!allowUnpaid || !isGlobalAdmin(fid)) {
      const allParticipants = await pokerDb.fetch('burrfriends_participants', {
        filters: { game_id: gameId },
        select: 'id,fid,status,tx_hash',
      });
      
      // Log for debugging
      safeLog('info', '[settle-contract] Checking unpaid participants', {
        gameId,
        isPrizeBasedGame,
        totalParticipants: allParticipants.length,
        participants: allParticipants.map((p: any) => ({
          id: p.id,
          fid: p.fid,
          status: p.status,
          hasTxHash: !!p.tx_hash,
          txHash: p.tx_hash ? `${p.tx_hash.substring(0, 10)}...` : null,
        })),
      });
      
      // Phase 4.0: Update unpaid participants check to distinguish prize-based vs paid games
      const unpaidParticipants = allParticipants.filter((p: any) => {
        // For prize-based games: status='joined' is sufficient (no payment required)
        if (isPrizeBasedGame) {
          return p.status !== 'joined' && p.status !== 'paid' && p.status !== 'refunded';
        }
        
        // For paid games: require payment (status='paid' OR status='joined' with tx_hash)
        const hasTxHash = p.tx_hash && p.tx_hash.trim().length > 0;
        const isPaid = p.status === 'paid' || (p.status === 'joined' && hasTxHash);
        return !isPaid && p.status !== 'refunded';
      });
      
      if (unpaidParticipants.length > 0) {
        safeLog('warn', '[settle-contract] Unpaid participants found, blocking settlement', {
          gameId,
          isPrizeBasedGame,
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
    let addressMap: Map<number, string[]> | null = null; // Prize-based winner+LPS batch; used by LPS block below
    
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
      const allParticipantsForGame = await pokerDb.fetch('burrfriends_participants', {
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

      // Verify each winner eligibility and derive their wallet address
      // For prize-based games: status='joined' is sufficient (no payment required)
      // For paid games: require payment (status='paid' OR status='joined' with tx_hash)
      const entryFeeAmount = parseFloat(String((game as any).buy_in_amount || 0));
      const winnerAddresses: string[] = [];
      
      // Phase 1: Batch wallet address fetching for prize-based games (reduces Neynar API calls from N to 1).
      // Include lastPersonStandingFid when present so LPS uses the same batch (saves 1 Neynar call).
      if (isPrizeBasedGame && winnerParticipants.length > 0) {
        const { getBulkWalletAddresses } = await import('~/lib/neynar-wallet');
        const winnerFids = winnerParticipants.map((p: any) => Number(p.fid)).filter((fid: number) => fid && !isNaN(fid));
        const fidsForBatch = [...new Set([...winnerFids, ...(lastPersonStandingFid && lastPersonStandingAwardAmount ? [Number(lastPersonStandingFid)] : [])])];
        if (fidsForBatch.length > 0) {
          addressMap = await getBulkWalletAddresses(fidsForBatch);
          // Reorder addresses so the wallet with the highest BETR stake is last (preferred for payouts)
          const { reorderByStaking } = await import('~/lib/settlement-core');
          addressMap = await reorderByStaking(addressMap);
        }
      }
      
      for (const participant of winnerParticipants as any[]) {
        // Verify participant eligibility based on game type
        const hasTxHash = participant.tx_hash && participant.tx_hash.trim().length > 0;
        let isEligible = false;
        
        if (isPrizeBasedGame) {
          // For prize-based games: status='joined' or 'paid' is sufficient (no payment required)
          isEligible = participant.status === 'joined' || participant.status === 'paid';
        } else {
          // For paid games: require payment (status='paid' OR status='joined' with tx_hash)
          isEligible = participant.status === 'paid' || (participant.status === 'joined' && hasTxHash);
        }
        
        if (!isEligible) {
          const errorMessage = isPrizeBasedGame
            ? `Participant FID ${participant.fid} has not joined the game (status: ${participant.status}). Only participants with status='joined' or 'paid' are eligible for payout.`
            : `Participant FID ${participant.fid} has not paid (status: ${participant.status}, hasTxHash: ${hasTxHash})`;
          
          return NextResponse.json<ApiResponse>(
            { ok: false, error: errorMessage },
            { status: 400 }
          );
        }

        // Derive wallet address based on game type
        let winnerAddress: string;
        
        if (isPrizeBasedGame) {
          // For prize-based games: use Neynar API to get wallet address (no payment transaction)
          // Phase 1: Use batched result if available, otherwise fall back to individual call
          const { BETR_STAKING_CONTRACT_ADDRESS, BETR_TOKEN_ADDRESS, GAME_ESCROW_CONTRACT } = await import('~/lib/constants');
          const allAddresses = addressMap?.get(participant.fid) || [];
          
          // Log all addresses for debugging
          safeLog('info', '[settle-contract] Neynar addresses retrieved', {
            gameId,
            fid: participant.fid,
            allAddresses,
            addressCount: allAddresses.length,
          });
          
          if (!allAddresses || allAddresses.length === 0) {
            return NextResponse.json<ApiResponse>(
              { ok: false, error: `Could not retrieve wallet address for winner FID ${participant.fid}. Please ensure the user has a connected wallet.` },
              { status: 400 }
            );
          }
          
          // Filter out known contract addresses (staking, token, escrow contracts)
          const knownContracts = [
            BETR_STAKING_CONTRACT_ADDRESS.toLowerCase(),
            BETR_TOKEN_ADDRESS.toLowerCase(),
            GAME_ESCROW_CONTRACT?.toLowerCase(),
            BASE_USDC_ADDRESS.toLowerCase(),
          ].filter(Boolean);
          
          const walletAddresses = allAddresses.filter(addr => {
            const addrLower = addr.toLowerCase();
            return !knownContracts.includes(addrLower);
          });
          
          // Log filtering results
          safeLog('info', '[settle-contract] Address filtering results', {
            gameId,
            fid: participant.fid,
            totalAddresses: allAddresses.length,
            filteredAddresses: walletAddresses.length,
            filteredOut: allAddresses.length - walletAddresses.length,
            knownContracts,
          });
          
          if (walletAddresses.length === 0) {
            return NextResponse.json<ApiResponse>(
              { 
                ok: false, 
                error: `No valid wallet address found for winner FID ${participant.fid}. All addresses returned are known contract addresses. Please ensure the user has a connected wallet address (not a contract).`,
                allAddressesReturned: allAddresses,
              },
              { status: 400 }
            );
          }
          
          // Prefer verified addresses over custody address for payouts
          // getAllPlayerWalletAddresses returns: [custody_address, ...verified_addresses] (in insertion order)
          // Since Set maintains insertion order, custody_address is first, then verified addresses
          // We want to prefer verified addresses (usually more reliable for payouts)
          // Strategy: Use the last non-contract address (likely a verified address) if multiple exist,
          // otherwise use the first non-contract address
          let selectedAddress: string | null = null;
          
          // If multiple addresses, prefer the last one (likely verified, since custody is added first)
          if (walletAddresses.length > 1) {
            selectedAddress = walletAddresses[walletAddresses.length - 1];
            safeLog('info', '[settle-contract] Multiple addresses found, preferring last (likely verified)', {
              gameId,
              fid: participant.fid,
              selectedAddress,
              allWalletAddresses: walletAddresses,
            });
          } else {
            selectedAddress = walletAddresses[0];
          }
          
          winnerAddress = selectedAddress;
          
          safeLog('info', '[settle-contract] Winner address selected', {
            gameId,
            fid: participant.fid,
            selectedAddress: winnerAddress,
            allAddresses,
            walletAddresses,
          });
        } else {
          // For paid games: derive address from payment transaction (same pattern as refund flow)
          // Get token address and decimals from game currency
          const currency = ((game as any).buy_in_currency || 'USDC') as string;
          const tokenAddress = mapCurrencyToAddress(currency);
          const tokenDecimals = getCurrencyDecimals(currency);
          
          const paymentVerification = await verifyPaymentOnChain({
            paymentTxHash: participant.tx_hash,
            expectedEscrowAddress: GAME_ESCROW_CONTRACT!,
            expectedTokenAddress: tokenAddress,
            expectedDecimals: tokenDecimals,
            expectedAmount: entryFeeAmount,
            chainId: BASE_CHAIN_ID,
          });

          if (!paymentVerification.success) {
            return NextResponse.json<ApiResponse>(
              { ok: false, error: `Payment verification failed for FID ${participant.fid}: ${paymentVerification.error}` },
              { status: 400 }
            );
          }

          winnerAddress = paymentVerification.payerAddress;
        }

        winnerAddresses.push(winnerAddress);
        winnerFidToAddressMap.set(participant.fid, winnerAddress);
      }

      // Store addresses for later (amounts will be calculated after contract state check or from prize config)
      finalRecipients = winnerAddresses;

      safeLog('info', '[settle-contract] Winner addresses derived', {
        gameId,
        isPrizeBasedGame,
        winnerCount: winnerFids.length,
        winnerAddresses,
        derivationMethod: isPrizeBasedGame ? 'Neynar API' : 'Payment transactions',
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

    // DIAGNOSTICS: Payment transaction sanity check (paid games only)
    // Declare early so it can be used in error messages throughout the function
    let paymentTxDiagnostics: {
      paymentTxTo: string | null;
      paymentTxFrom: string | null;
      paymentTxHash: string | null;
      wentToEscrow: boolean;
      wentToUsdcDirect: boolean;
    } | null = null;

    // Phase 4.2: Validate Last Person Standing Award (Scheduled games only)
    if (lastPersonStandingFid || lastPersonStandingAwardAmount) {
      const isScheduledGame = (game as any).game_type === 'large_event' || ((game as any).max_participants && (game as any).max_participants > 9);
      
      if (!isScheduledGame) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: 'Last Person Standing Award is only available for Scheduled games',
            gameType: (game as any).game_type,
            maxParticipants: (game as any).max_participants,
          },
          { status: 400 }
        );
      }
      
      if (lastPersonStandingFid && !lastPersonStandingAwardAmount) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: 'lastPersonStandingAwardAmount required when lastPersonStandingFid provided',
          },
          { status: 400 }
        );
      }
      
      // Verify award recipient is a participant
      const awardParticipant = await pokerDb.fetch('burrfriends_participants', {
        filters: { game_id: gameId, fid: lastPersonStandingFid },
        limit: 1,
      });
      
      if (!awardParticipant || awardParticipant.length === 0) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `Last Person Standing Award recipient (FID ${lastPersonStandingFid}) is not a participant`,
          },
          { status: 400 }
        );
      }
    }

    // For paid games, fetch contract state (needed for amount calculation)
    // For prize-based games, contract state is not needed (we use prize_amounts from game config)
    let contractState: {
      contractGameId: string;
      currency: string;
      entryFee: string;
      totalCollected: string;
      isActive: boolean;
      isSettled: boolean;
    } | null = null;

    if (!isPrizeBasedGame) {
      // PAID GAMES: Fetch contract state
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
    }

    // Phase 4: Calculate amounts - different logic for prize-based vs paid games
    if (mode === 'winnerFids') {
      // Phase 4.1: For prize-based games, use prize_amounts from game config
      // For paid games, use contract totalCollected
      if (isPrizeBasedGame) {
        // Determine if this is a tournament (Scheduled game) BEFORE validation
        // Tournaments can have empty/short prize_amounts (will use defaults/padding)
        const isTournament = (game as any).game_type === 'large_event' || 
                            ((game as any).max_participants != null && (game as any).max_participants > 9);
        
        // PRIZE-BASED GAMES: Use prize_amounts from game config
        const basePrizeAmounts = (game as any).prize_amounts || [];
        
        // For Sit & Go (non-tournament): require exact prize_amounts match
        // For Tournaments: allow empty/short arrays (will use defaults/padding in tournament block)
        if (!isTournament) {
          if (!Array.isArray(basePrizeAmounts) || basePrizeAmounts.length === 0) {
            return NextResponse.json<ApiResponse>(
              { 
                ok: false, 
                error: `Prize-based game must have prize_amounts configured. Game has no prize amounts.`,
                mode: 'winnerFids',
                gameId,
              },
              { status: 400 }
            );
          }
          
          if (basePrizeAmounts.length !== winnerFids.length) {
            return NextResponse.json<ApiResponse>(
              { 
                ok: false, 
                error: `Prize amounts array length (${basePrizeAmounts.length}) must match winner count (${winnerFids.length})`,
                mode: 'winnerFids',
                gameId,
                prizeAmountsLength: basePrizeAmounts.length,
                winnerCount: winnerFids.length,
              },
              { status: 400 }
            );
          }
        }

        if (isPrizeBasedGame && isTournament) {
          // TOURNAMENT PRIZE-BASED: Use contract view to calculate payouts with multipliers
          const applyMultipliers = (game as any).apply_staking_multipliers ?? true;
          const doubleIfBB = (game as any).double_payout_if_bb ?? false;
          
          // Validate mutual exclusivity (defense in depth)
          if (applyMultipliers && doubleIfBB) {
            return NextResponse.json<ApiResponse>(
              { ok: false, error: "Game configuration error: Cannot have both apply_staking_multipliers and double_payout_if_bb enabled. Please contact support." },
              { status: 500 }
            );
          }
          
          // Get base amounts: use prize_amounts if present, else defaults for 1st/2nd/3rd (0 for 4th+)
          const basePrizeAmountsForTournament = [...basePrizeAmounts];
          if (basePrizeAmountsForTournament.length === 0) {
            // Use defaults for tournaments: [2M, 1M, 420k] for 1st/2nd/3rd, 0 for 4th+
            const { TOURNAMENT_DEFAULT_PRIZE_1ST, TOURNAMENT_DEFAULT_PRIZE_2ND, TOURNAMENT_DEFAULT_PRIZE_3RD } = await import('~/lib/constants');
            const defaults = [TOURNAMENT_DEFAULT_PRIZE_1ST, TOURNAMENT_DEFAULT_PRIZE_2ND, TOURNAMENT_DEFAULT_PRIZE_3RD];
            for (let i = 0; i < winnerFids.length; i++) {
              basePrizeAmountsForTournament[i] = i < 3 ? defaults[i] : 0;
            }
          }
          
          // Ensure array length matches winner count (pad with 0 for 4th+ if needed)
          while (basePrizeAmountsForTournament.length < winnerFids.length) {
            basePrizeAmountsForTournament.push(0);
          }
          
          // Convert base amounts to wei (18 decimals)
          const baseAmountsWei = basePrizeAmountsForTournament.slice(0, winnerFids.length).map((amt: any) => 
            ethers.parseUnits(String(amt || 0), 18)
          );
          
          // Call contract view to get final amounts with multipliers
          const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
          const contract = new ethers.Contract(
            GAME_ESCROW_CONTRACT!,
            GAME_ESCROW_ABI,
            provider
          );
          
          try {
            const finalAmountsWei = await contract.getTournamentPayouts(
              finalRecipients, // Winner addresses (already resolved from winnerFids)
              baseAmountsWei,
              applyMultipliers,
              doubleIfBB
            );
            
            // Use contract-calculated amounts
            // ethers.js v6 returns bigint[] for uint256[], convert to ensure type safety
            finalAmounts = finalAmountsWei.map((amt: any) => {
              // Handle both bigint and string/number returns (defensive)
              if (typeof amt === 'bigint') return amt;
              if (typeof amt === 'string') return BigInt(amt);
              if (typeof amt === 'number') return BigInt(amt);
              // If it's an object with toString (e.g., old BigNumber), convert
              return BigInt(String(amt));
            });
            
            safeLog('info', '[settle-contract] Tournament payouts calculated via contract view', {
              gameId,
              isTournament,
              applyMultipliers,
              doubleIfBB,
              winnerCount: winnerFids.length,
              baseAmounts: basePrizeAmountsForTournament.slice(0, winnerFids.length),
              finalAmounts: finalAmounts.map(a => ethers.formatUnits(a, 18)),
            });
          } catch (contractViewError: any) {
            safeLog('error', '[settle-contract] Contract view call failed', {
              gameId,
              error: contractViewError?.message,
            });
            return NextResponse.json<ApiResponse>(
              { 
                ok: false, 
                error: `Failed to calculate tournament payouts: ${contractViewError?.message || 'Unknown error'}`,
                gameId,
                winnerCount: winnerFids.length,
                recipientCount: finalRecipients.length,
              },
              { status: 500 }
            );
          }
        } else {
          // NON-TOURNAMENT PRIZE-BASED (Sit & Go): Use base amounts directly, no multipliers
          const finalPrizeAmounts = basePrizeAmounts.map((amt: any) => parseFloat(String(amt)));
          
          // Convert to wei for BETR transfers (18 decimals)
          finalAmounts = finalPrizeAmounts.map((amt: number) => 
            ethers.parseUnits(amt.toString(), 18)
          );

          safeLog('info', '[settle-contract] Prize amounts calculated from game config (prize-based game, non-tournament)', {
            gameId,
            isTournament: false,
            winnerCount: winnerFids.length,
            basePrizeAmounts,
            finalPrizeAmounts,
            amountsInWei: finalAmounts.map(a => a.toString()),
          });
        }
      } else {
        // PAID GAMES: Use contract totalCollected (existing logic)
        if (!contractState) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: "Contract state not available for paid game" },
            { status: 500 }
          );
        }
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
    }

    // Phase 4.3: For prize-based games, use direct transfers (bypass contract)
    // This happens AFTER amount calculation
    if (isPrizeBasedGame) {
      // PRIZE-BASED GAMES: Direct BETR transfers (bypass contract)
      const { BETR_TOKEN_ADDRESS } = await import('~/lib/constants');
      const MASTER_WALLET_PRIVATE_KEY = process.env.MASTER_WALLET_PRIVATE_KEY;
      
      if (!MASTER_WALLET_PRIVATE_KEY) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Master wallet private key not configured" },
          { status: 500 }
        );
      }

      const { createPublicClient, http, createWalletClient } = await import('viem');
      const { base } = await import('viem/chains');
      const { privateKeyToAccount } = await import('viem/accounts');
      
      // Get BETR token ABI (ERC20 transfer function)
      const BETR_ABI = [
        {
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ name: '', type: 'bool' }]
        }
      ] as const;
      
      const publicClient = createPublicClient({
        chain: base,
        transport: http(BASE_RPC_URL),
      });
      
      const account = privateKeyToAccount(MASTER_WALLET_PRIVATE_KEY as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(BASE_RPC_URL),
      });

      // Risk 6 Mitigation: Check master wallet BETR balance before settlement
      const BETR_ABI_BALANCE = [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }]
        }
      ] as const;

      const masterWalletAddress = account.address;
      const masterBalance = await publicClient.readContract({
        address: BETR_TOKEN_ADDRESS as `0x${string}`,
        abi: BETR_ABI_BALANCE,
        functionName: 'balanceOf',
        args: [masterWalletAddress],
      });

      // Calculate total needed: sum of all prize amounts + award (if any)
      const totalPrizesNeeded = finalAmounts.reduce((sum, amt) => sum + amt, 0n);
      const awardAmountNeeded = lastPersonStandingFid && lastPersonStandingAwardAmount
        ? ethers.parseUnits(lastPersonStandingAwardAmount.toString(), 18)
        : 0n;
      const totalNeeded = totalPrizesNeeded + awardAmountNeeded;

      if (masterBalance < totalNeeded) {
        safeLog('error', '[settle-contract] Insufficient master wallet balance', {
          gameId,
          masterWalletAddress,
          masterBalance: masterBalance.toString(),
          totalNeeded: totalNeeded.toString(),
          totalPrizes: totalPrizesNeeded.toString(),
          awardAmount: awardAmountNeeded.toString(),
        });

        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: `Insufficient master wallet balance. Required: ${ethers.formatUnits(totalNeeded, 18)} BETR, Available: ${ethers.formatUnits(masterBalance, 18)} BETR`,
            masterWalletAddress,
            masterBalance: masterBalance.toString(),
            totalNeeded: totalNeeded.toString(),
            totalPrizes: totalPrizesNeeded.toString(),
            awardAmount: awardAmountNeeded.toString(),
          },
          { status: 500 }
        );
      }

      safeLog('info', '[settle-contract] Master wallet balance check passed', {
        gameId,
        masterWalletAddress,
        masterBalance: masterBalance.toString(),
        totalNeeded: totalNeeded.toString(),
        remainingAfterSettlement: (masterBalance - totalNeeded).toString(),
      });

      // Send direct transfers for each winner
      const transferTxHashes: string[] = [];
      for (let i = 0; i < finalRecipients.length; i++) {
        const recipient = finalRecipients[i];
        const amount = finalAmounts[i];
        
        const txHash = await walletClient.writeContract({
          address: BETR_TOKEN_ADDRESS as `0x${string}`,
          abi: BETR_ABI,
          functionName: 'transfer',
          args: [recipient as `0x${string}`, amount],
        });
        
        transferTxHashes.push(txHash);
        
        safeLog('info', '[settle-contract] Direct BETR transfer sent', {
          gameId,
          recipient,
          amount: amount.toString(),
          txHash,
        });
      }

      // Phase 4.2: Send Last Person Standing Award if provided (validated earlier).
      // Use addressMap from batch when available (saves 1 Neynar call); else getAllPlayerWalletAddresses (e.g. LPS-only, no winners).
      let awardTxHash: string | null = null;
      if (lastPersonStandingFid && lastPersonStandingAwardAmount) {
        let awardRecipientAddress: string | undefined;
        if (addressMap?.has(Number(lastPersonStandingFid))) {
          // Pick last address (reordered by staking — highest stake is last)
          const lpsAddrs = addressMap.get(Number(lastPersonStandingFid)) || [];
          awardRecipientAddress = lpsAddrs.length > 0 ? lpsAddrs[lpsAddrs.length - 1] : undefined;
        } else {
          // Fallback: FID wasn't in the batch — fetch + reorder individually
          const { getAllPlayerWalletAddresses } = await import('~/lib/neynar-wallet');
          const awardAddresses = await getAllPlayerWalletAddresses(lastPersonStandingFid);
          const { reorderByStaking: reorderLps } = await import('~/lib/settlement-core');
          const lpsMap = await reorderLps(new Map([[Number(lastPersonStandingFid), awardAddresses]]));
          const lpsReordered = lpsMap.get(Number(lastPersonStandingFid)) || awardAddresses;
          awardRecipientAddress = lpsReordered.length > 0 ? lpsReordered[lpsReordered.length - 1] : undefined;
        }
        if (!awardRecipientAddress) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: `Could not retrieve wallet address for Last Person Standing Award recipient FID ${lastPersonStandingFid}` },
            { status: 400 }
          );
        }
        const awardAmountInWei = ethers.parseUnits(lastPersonStandingAwardAmount.toString(), 18);
        
        awardTxHash = await walletClient.writeContract({
          address: BETR_TOKEN_ADDRESS as `0x${string}`,
          abi: BETR_ABI,
          functionName: 'transfer',
          args: [awardRecipientAddress as `0x${string}`, awardAmountInWei],
        });
        
        transferTxHashes.push(awardTxHash);
        
        safeLog('info', '[settle-contract] Last Person Standing Award transferred', {
          gameId,
          recipientFid: lastPersonStandingFid,
          recipientAddress: awardRecipientAddress,
          amount: lastPersonStandingAwardAmount.toString(),
          txHash: awardTxHash,
        });
      }

      // Store first transfer tx hash as settlement tx
      const settleTxHash = transferTxHashes[0];
      
      // Update game status and store settlement data
      await pokerDb.update('burrfriends_games', { id: gameId }, {
        status: 'settled',
        settle_tx_hash: settleTxHash,
        last_person_standing_fid: lastPersonStandingFid || null,
        last_person_standing_award_amount: lastPersonStandingAwardAmount || null,
      });

      // Update participant records with payout info
      const settledAt = new Date().toISOString();
      
      // Update winners with prize payouts
      for (let i = 0; i < winnerFids.length; i++) {
        const winnerFid = winnerFids[i];
        const prizeAmountWei = finalAmounts[i];
        // Convert from wei (18 decimals) to human-readable BETR
        const prizeAmountDecimal = parseFloat(ethers.formatUnits(prizeAmountWei, 18));
        const txHash = transferTxHashes[i];
        
        await pokerDb.update('burrfriends_participants', 
          { game_id: gameId, fid: winnerFid },
          {
            payout_tx_hash: txHash,
            payout_amount: prizeAmountDecimal,
            paid_out_at: settledAt,
            status: 'settled',
          } as any
        );
      }

      // Update Last Person Standing Award recipient (if different from winners)
      if (lastPersonStandingFid && lastPersonStandingAwardAmount && awardTxHash) {
        const isAwardWinner = winnerFids.includes(lastPersonStandingFid);
        
        if (isAwardWinner) {
          // Award recipient is also a winner - add award to their existing payout record
          const existingPayout = await pokerDb.fetch('burrfriends_participants', {
            filters: { game_id: gameId, fid: lastPersonStandingFid },
            limit: 1,
          });
          
          if (existingPayout.length > 0) {
            const currentPayout = parseFloat(String(existingPayout[0].payout_amount || 0));
            await pokerDb.update('burrfriends_participants',
              { game_id: gameId, fid: lastPersonStandingFid },
              {
                payout_amount: currentPayout + lastPersonStandingAwardAmount,
                // Keep existing payout_tx_hash (prize transfer), award is separate
              } as any
            );
          }
        } else {
          // Award recipient is not a winner - create separate payout record
          await pokerDb.update('burrfriends_participants',
            { game_id: gameId, fid: lastPersonStandingFid },
            {
              payout_tx_hash: awardTxHash,
              payout_amount: lastPersonStandingAwardAmount,
              paid_out_at: settledAt,
              status: 'settled',
            } as any
          );
        }
      }

      // Update stats for all winners and award recipient
      try {
        const { updatePlayerStats } = await import('~/lib/stats');
        const allFidsToUpdate = [...winnerFids];
        if (lastPersonStandingFid) {
          allFidsToUpdate.push(lastPersonStandingFid);
        }
        
        for (const participantFid of allFidsToUpdate) {
          try {
            await updatePlayerStats(participantFid);
          } catch (statsError: any) {
            safeLog('warn', '[settle-contract] Failed to update stats', { 
              fid: participantFid, 
              error: statsError?.message 
            });
          }
        }
      } catch (statsError: any) {
        safeLog('warn', '[settle-contract] Failed to update stats', { error: statsError?.message });
      }

      // Return success for prize-based games (direct transfers complete)
      // Include settleTxHash (first transfer) and Basescan URLs for immediate UI display
      const prizeSettleTxHash = transferTxHashes[0] || '';
      return NextResponse.json<ApiResponse<{
        mode: 'prize_based';
        settleTxHash: string;
        settleTxUrl: string | undefined;
        txUrls: string[];
        transferTxHashes: string[];
        prizesDistributed: number;
        awardDistributed: number;
        winners: Array<{ fid: number; prize: number; doubled?: boolean }>;
      }>>({
        ok: true,
        data: {
          mode: 'prize_based',
          settleTxHash: prizeSettleTxHash,
          settleTxUrl: getBaseScanTxUrl(prizeSettleTxHash) ?? undefined,
          txUrls: getBaseScanTxUrls(transferTxHashes),
          transferTxHashes,
          prizesDistributed: finalRecipients.length,
          awardDistributed: lastPersonStandingFid ? 1 : 0,
          winners: winnerFids.map((fid, i) => {
            const prizeDecimal = parseFloat(ethers.formatUnits(finalAmounts[i], 18));
            const basePrize = (game as any).prize_amounts?.[i] || 0;
            const doubled = prizeDecimal > basePrize;
            return {
              fid,
              prize: prizeDecimal,
              doubled,
            };
          }),
        },
      });
    }

    // Calculate requested payout total for logging/diagnostics
    const requestedPayoutTotal = finalAmounts.reduce((sum, amt) => sum + amt, 0n);
    const requestedPayouts = finalAmounts.map(a => a.toString());

    // Get currency type for proper amount conversion (for audit logging)
    const currency = ((game as any).buy_in_currency || 'USDC') as 'ETH' | 'USDC';

    // Attempt settlement (paid games only - prize-based games already returned above)
    if (!contractState) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Contract state not available for paid game" },
        { status: 500 }
      );
    }

    // Prepare contract for paid games
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

    // Populate paymentTxDiagnostics (for paid games only)
    try {
      // Pick first paid participant with tx_hash for diagnostic check
      const allParticipantsForDiagnostics = await pokerDb.fetch('burrfriends_participants', {
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
        await pokerDb.update<Game>('burrfriends_games',
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

              await pokerDb.update('burrfriends_participants',
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
          const allParticipants = await pokerDb.fetch('burrfriends_participants', {
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

                  await pokerDb.update('burrfriends_participants',
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

      // Phase 4: Update stats for all players after settlement
      try {
        const { updatePlayerStats } = await import('~/lib/stats');
        
        // Get all participants in this game to update their stats
        const allGameParticipants = await pokerDb.fetch('burrfriends_participants', {
          filters: { game_id: gameId },
          select: 'fid',
        });

        // Update stats for each participant (non-blocking - don't fail settlement if stats update fails)
        const uniqueFids = Array.from(new Set(allGameParticipants.map((p: any) => p.fid)));
        for (const participantFid of uniqueFids) {
          try {
            await updatePlayerStats(participantFid);
          } catch (statsError: any) {
            // Log but don't fail settlement if stats update fails for one player
            safeLog('warn', '[settle-contract] Failed to update stats for player', {
              gameId,
              fid: participantFid,
              error: statsError?.message || 'Unknown error',
            });
          }
        }

        safeLog('info', '[settle-contract] Updated stats for players', {
          gameId,
          playerCount: uniqueFids.length,
        });
      } catch (statsUpdateError: any) {
        // Log but don't fail settlement if stats update fails
        safeLog('warn', '[settle-contract] Failed to update player stats', {
          gameId,
          error: statsUpdateError?.message || 'Unknown error',
        });
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

      // Phase 21: Send winner notifications after settlement (async, non-blocking)
      // Only send when we have winnerFids (not for legacy recipients/amounts mode). Never send for preview games.
      if (mode === 'winnerFids' && winnerFids.length > 0 && !(game as any).is_preview) {
        const gameName = (game as any).name || 'Poker Game';
        after(async () => {
          try {
            const truncatedTitle = gameName.length > 20 ? gameName.substring(0, 20) + '...' : gameName;
            for (let i = 0; i < winnerFids.length; i++) {
              const winnerFid = winnerFids[i];
              const amountStr = amountsForResponse[i];
              // Parse amount string to number for formatting (e.g., "1000.000000" -> 1000)
              const amountNum = parseFloat(amountStr);
              await sendNotificationToFid(
                winnerFid,
                {
                  title: `${truncatedTitle} - Results`,
                  body: `You won ${formatPrizeAmount(amountNum)} BETR! Click here to view the payment details.`,
                  targetUrl: `${APP_URL}/games/${gameId}`,
                },
                `settlement:poker:${gameId}:${winnerFid}`
              );
            }
            safeLog('info', '[settle-contract] Winner notifications sent', { gameId, winnerCount: winnerFids.length });
          } catch (notifErr) {
            safeLog('error', '[settle-contract] Failed to send winner notifications', {
              gameId,
              error: (notifErr as Error)?.message,
            });
          }
        });
      }

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
