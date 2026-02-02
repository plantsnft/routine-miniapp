import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { encryptCreds } from "~/lib/crypto/credsVault";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import { normalizeGame } from "~/lib/games";
import type { ApiResponse, Game } from "~/lib/types";

/**
 * GET /api/games?club_id=xxx&status=scheduled
 * Get games with optional filters
 * 
 * MVP: Open signup - any authed user can see all games (no membership filtering)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 */
export const dynamic = 'force-dynamic'; // Ensure no caching

export async function GET(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    const { searchParams } = new URL(req.url);
    const clubId = searchParams.get("club_id");
    const status = searchParams.get("status");

    // Build filters
    const filters: Record<string, string> = {};
    if (clubId) {
      filters.club_id = clubId;
    }
    if (status) {
      filters.status = status;
    }

    // MVP: Open signup - return all games (no membership filtering)
    // Fetch games - use pokerDb
    // Note: Database uses 'game_date', but API/frontend uses 'scheduled_time'
    const gamesRaw = await pokerDb.fetch<any>('games', {
      select: '*',
      filters,
      order: 'game_date.asc',
    });

    // Fetch participant counts for all games (only count status='joined')
    const participantCounts: Record<string, number> = {};
    for (const game of gamesRaw) {
      try {
        const participants = await pokerDb.fetch<any>('participants', {
          filters: { game_id: game.id, status: 'joined' }, // Only count participants with status='joined'
          select: 'id',
        });
        participantCounts[game.id] = participants.length;
      } catch (err) {
        console.error(`[API][games] Error fetching participant count for game ${game.id}:`, err);
        participantCounts[game.id] = 0;
      }
    }

    // Check if current user has joined each game (status in 'joined' or 'paid')
    const viewerJoinedStatus: Record<string, boolean> = {};
    for (const game of gamesRaw) {
      try {
        // Check for participant record with status 'joined' or 'paid'
        const viewerParticipants = await pokerDb.fetch<any>('participants', {
          filters: { game_id: game.id, fid: fid },
          select: 'id,status',
          limit: 1,
        });
        // Check if any participant has status 'joined' or 'paid'
        viewerJoinedStatus[game.id] = viewerParticipants.some((p: any) => 
          p.status === 'joined' || p.status === 'paid'
        );
      } catch (err) {
        console.error(`[API][games] Error checking viewer join status for game ${game.id}:`, err);
        viewerJoinedStatus[game.id] = false;
      }
    }

    // Normalize game fields (handles buy_in_* and entry_fee_* fields) and add computed fields
    const { enrichGameWithRegistrationStatus } = await import("~/lib/games");
    const games = gamesRaw.map((g: any) => {
      const normalized = normalizeGame(g);
      const baseGame = {
        ...normalized,
        scheduled_time: g.game_date || null,
        title: g.name || null,
        max_participants: g.max_participants ?? null,
        game_type: g.game_type || 'standard',
        registration_close_minutes: g.registration_close_minutes ?? 0,
        participant_count: participantCounts[g.id] || 0, // Count of participants with status='joined'
        viewer_has_joined: viewerJoinedStatus[g.id] || false, // Whether the current viewer has joined this game
      } as Game;
      // Enrich with registration status using participant count
      const participantCount = participantCounts[g.id] || 0;
      return enrichGameWithRegistrationStatus(baseGame, participantCount);
    });

    // Get version for deployment verification
    const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown';

    const response = NextResponse.json<ApiResponse<Game[]>>({
      ok: true,
      data: games,
    });
    
    response.headers.set('X-App-Version', gitSha);
    return response;
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('member')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][games] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch games" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/games
 * Create a new game (club owner only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireClubOwner - only club owner can create games
 */
export async function POST(req: NextRequest) {
  let fid: number | null = null;
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const auth = await requireAuth(req);
    fid = auth.fid;
    
    const body = await req.json();
    const {
      club_id,
      title,
      description,
      clubgg_link,
      scheduled_time,
      gating_type,
      entry_fee_amount,
      entry_fee_currency,
      staking_pool_id,
      staking_token_contract,
      staking_min_amount,
      game_password,
      farcaster_cast_url,
      total_reward_amount,
      reward_currency,
      payout_bps,
      is_prefunded,
      prefunded_at,
      can_settle_at,
      max_participants,
      // New fields for NFT and wheel features
      game_type: bodyGameType,
      prize_type,
      prize_configuration,
      wheel_background_color,
      wheel_segment_type,
      wheel_image_urls,
      wheel_participant_weights,
    } = body;

    if (!club_id) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing required field: club_id" },
        { status: 400 }
      );
    }

    // SAFETY: Require club ownership
    const { requireClubOwner } = await import("~/lib/pokerPermissions");
    // MVP-only: Require Giveaway Games club
    const { requireGiveawayGamesClub } = await import("~/lib/pokerPermissions");
    await requireGiveawayGamesClub(club_id);
    
    await requireClubOwner(fid, club_id);

    // Encrypt ClubGG credentials if provided
    // Support password-only (no username required)
    let creds_ciphertext = null;
    let creds_iv = null;
    let creds_version = null;
    
    // Unified password extraction - prioritize game_password since that's what the client sends
    const rawPassword =
      body.game_password ??
      body.password ??
      body.clubggPassword ??
      body.clubgg_password ??
      body.creds?.password ??
      body.credentials?.password ??
      "";
    
    // Unified username extraction (optional)
    const rawUsername =
      body.game_username ??
      body.clubgg_username ??
      body.clubggUsername ??
      body.creds?.username ??
      body.credentials?.username ??
      "";
    
    // Encrypt if password is provided (username is optional)
    if (rawPassword && rawPassword.trim() !== '') {
      const correlationId = getCorrelationId(req);
      const passwordLen = rawPassword.length;
      
      // FAIL LOUD: Require encryption key to exist before attempting encryption
      const encryptionKey = process.env.POKER_CREDS_ENCRYPTION_KEY;
      if (!encryptionKey || encryptionKey.trim() === '') {
        safeLog('error', '[games] Password provided but encryption key missing', {
          correlationId,
          fid,
          hasPassword: true,
          passwordLen,
        });
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Server misconfigured: missing creds encryption key. Cannot store password." },
          { status: 500 }
        );
      }
      
      try {
        const encrypted = encryptCreds({
          username: rawUsername?.trim() || '', // Username can be empty
          password: rawPassword.trim(),
        });
        creds_ciphertext = encrypted.ciphertextB64;
        creds_iv = encrypted.ivB64;
        creds_version = encrypted.version;
        
        // FAIL LOUD: Verify encryption produced non-empty values
        if (!creds_ciphertext || creds_ciphertext.trim() === '' || !creds_iv || creds_iv.trim() === '') {
          safeLog('error', '[games] Encryption succeeded but produced empty ciphertext/iv', {
            correlationId,
            fid,
            hasPassword: true,
            passwordLen,
            hasCiphertext: !!creds_ciphertext,
            hasIv: !!creds_iv,
          });
          return NextResponse.json<ApiResponse>(
            { ok: false, error: "Failed to encrypt credentials: encryption produced empty result" },
            { status: 500 }
          );
        }
        
        // SAFETY: Never log plaintext credentials - only log metadata about encryption
        // Log will be done after insert with gameId (see below)
      } catch (encryptError: any) {
        safeLog('error', '[games] Failed to encrypt credentials', {
          correlationId: getCorrelationId(req),
          fid,
          hasPassword: true,
          passwordLen,
          error: encryptError.message,
        });
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `Failed to encrypt credentials: ${encryptError.message}` },
          { status: 500 }
        );
      }
    }

    // Build game object matching actual database schema
    // Schema has: id, club_id, name, description, buy_in_amount, buy_in_currency, 
    // game_date, max_participants, creds_ciphertext, creds_iv, creds_version, status
    // Generate a default name if title is not provided (name is NOT NULL)
    const defaultName = entry_fee_amount 
      ? `${entry_fee_amount} ${entry_fee_currency || 'USDC'} Game`
      : 'Entry Fee Game';
    
    // Check if user is admin
    const { isAdmin } = await import('~/lib/admin');
    const userIsAdmin = isAdmin(fid);
    
    // Validate game type: 'poker' | 'giveaway_wheel' | 'standard' | 'large_event'
    // CRITICAL: Handle new game types (poker, giveaway_wheel) vs legacy types (standard, large_event)
    let gameType: 'poker' | 'giveaway_wheel' | 'standard' | 'large_event';
    
    if (bodyGameType === 'giveaway_wheel' || bodyGameType === 'poker') {
      // New game types
      gameType = bodyGameType;
    } else if (bodyGameType === 'large_event') {
      // Legacy type
      gameType = 'large_event';
    } else {
      // Default: infer from max_participants or default to standard
      gameType = body.game_type === 'large_event' ? 'large_event' : 'standard';
    }
    
    // Validate game type
    if (gameType !== 'poker' && gameType !== 'giveaway_wheel' && gameType !== 'standard' && gameType !== 'large_event') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Invalid game_type: ${gameType}. Must be "poker", "giveaway_wheel", "standard", or "large_event"` },
        { status: 400 }
      );
    }
    
    // If max_participants is missing/null/empty and user is admin, infer large_event (open-registration)
    // CRITICAL: Don't override explicitly set game types (poker, giveaway_wheel)
    const maxParticipantsValue = max_participants;
    const isMaxBlank = maxParticipantsValue === null || 
                       maxParticipantsValue === undefined || 
                       maxParticipantsValue === '' || 
                       maxParticipantsValue === 0 || 
                       String(maxParticipantsValue).trim() === '' ||
                       String(maxParticipantsValue).trim() === '0';
    
    // Only infer large_event if game type wasn't explicitly set to poker or giveaway_wheel
    if (isMaxBlank && userIsAdmin && gameType !== 'poker' && gameType !== 'giveaway_wheel') {
      gameType = 'large_event'; // Open-registration mode
    }
    
    // Check admin access for large_event (if explicitly requested or inferred)
    if (gameType === 'large_event' && !userIsAdmin) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only admins can create large_event/open-registration games" },
        { status: 403 }
      );
    }
    
    // Validate max_participants based on game type
    // For standard games: preserve existing behavior (no hardcoded cap, use whatever is provided)
    // For large_event: cap at 99, but allow NULL for open-registration
    const minParticipants = 2;
    
    let validatedMaxParticipants: number | null = null;
    
    // If max_participants is blank and we inferred large_event, keep it as NULL (open-registration)
    if (isMaxBlank && gameType === 'large_event') {
      validatedMaxParticipants = null; // NULL = open-registration, effective max 99 enforced at runtime
    } else if (max_participants !== undefined && max_participants !== null && max_participants !== 0 && String(max_participants).trim() !== '' && String(max_participants).trim() !== '0') {
      // Validate provided max_participants
      const parsed = parseInt(String(max_participants), 10);
      if (!isNaN(parsed) && parsed >= minParticipants) {
        if (gameType === 'large_event') {
          // For large_event: cap at 99
          if (parsed <= 99) {
            validatedMaxParticipants = parsed;
          } else {
            return NextResponse.json<ApiResponse>(
              { ok: false, error: "max_participants must be between 2 and 99 for large_event games" },
              { status: 400 }
            );
          }
        } else {
          // For standard games: use whatever is provided (preserve existing behavior)
          validatedMaxParticipants = parsed;
        }
      }
    }
    
    // For large_event with no provided max (not blank-triggered), default to 99 (backward compatibility)
    if (gameType === 'large_event' && validatedMaxParticipants === null && !isMaxBlank) {
      validatedMaxParticipants = 99;
    }
    
    // Set registration_close_minutes based on game type
    const registrationCloseMinutes = gameType === 'large_event' ? 15 : 0;
    
    // Determine gating_type: "entry_fee" if entry_fee_amount > 0, else "open"
    const entryFeeAmountParsed = entry_fee_amount ? parseFloat(String(entry_fee_amount)) : 0;
    const determinedGatingType = entryFeeAmountParsed > 0 && entry_fee_currency ? 'entry_fee' : 'open';
    
    // CRITICAL FIX: Validate prize configuration if provided
    if (prize_type) {
      if (!['tokens', 'nfts', 'mixed'].includes(prize_type)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: 'Invalid prize_type. Must be "tokens", "nfts", or "mixed"' },
          { status: 400 }
        );
      }
      
      // Validate prize_configuration array
      if (prize_configuration && Array.isArray(prize_configuration)) {
        // Sort by position
        const sorted = prize_configuration.sort((a: any, b: any) => a.position - b.position);
        
        // Validate positions are sequential (1, 2, 3, ...)
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].position !== i + 1) {
            return NextResponse.json<ApiResponse>(
              { ok: false, error: `Prize positions must be sequential starting from 1. Found position ${sorted[i].position} at index ${i}` },
              { status: 400 }
            );
          }
        }
        
        // Validate each prize
        const { ethers } = await import('ethers');
        for (const prize of sorted) {
          // Validate token amounts
          if (prize.token_amount !== null && prize.token_amount !== undefined) {
            const amount = parseFloat(String(prize.token_amount));
            if (isNaN(amount) || amount <= 0) {
              return NextResponse.json<ApiResponse>(
                { ok: false, error: `Invalid token_amount for position ${prize.position}: must be positive number` },
                { status: 400 }
              );
            }
          }
          
          // Validate NFTs
          if (prize.nfts && Array.isArray(prize.nfts)) {
            for (const nft of prize.nfts) {
              if (!ethers.isAddress(nft.contract_address)) {
                return NextResponse.json<ApiResponse>(
                  { ok: false, error: `Invalid NFT contract address for position ${prize.position}: ${nft.contract_address}` },
                  { status: 400 }
                );
              }
              const tokenId = parseInt(String(nft.token_id), 10);
              if (isNaN(tokenId) || tokenId < 0) {
                return NextResponse.json<ApiResponse>(
                  { ok: false, error: `Invalid NFT token ID for position ${prize.position}: must be non-negative integer` },
                  { status: 400 }
                );
              }
            }
          }
        }
      }
    }
    
    const gameData: any = {
      club_id,
      name: title || defaultName, // Database uses 'name', API uses 'title'
      description: description || null,
      game_date: scheduled_time || new Date().toISOString(), // Map scheduled_time to game_date
      // buy_in_amount is NOT NULL in database, so default to 0 if entry_fee_amount is not provided
      // This allows games without entry fees (gating_type='open')
      buy_in_amount: entryFeeAmountParsed,
      buy_in_currency: entry_fee_currency || 'USD',
      gating_type: gating_type || determinedGatingType, // Use provided gating_type or infer from entry fee
      status: "open", // Use 'open' to match schema default
      max_participants: validatedMaxParticipants, // Include max_participants if provided and valid
      game_type: gameType,
      registration_close_minutes: registrationCloseMinutes,
      // Store encrypted credentials (never plaintext)
      creds_ciphertext,
      creds_iv,
      creds_version,
      // Prize and wheel configuration
      prize_type: prize_type || 'tokens',
      wheel_background_color: wheel_background_color || '#FF3B1A',
      wheel_segment_type: wheel_segment_type || 'equal',
      wheel_image_urls: wheel_image_urls || [],
      wheel_participant_weights: wheel_participant_weights || null,
    };
    
    // Add payout_bps if provided (payout structure as basis points array)
    if (payout_bps !== undefined && payout_bps !== null) {
      if (Array.isArray(payout_bps) && payout_bps.length > 0) {
        // Validate: must be array of integers
        const validatedBps = payout_bps.map(Number).filter(Number.isInteger);
        if (validatedBps.length === payout_bps.length) {
          gameData.payout_bps = validatedBps;
        }
      }
    }
    
    const correlationId = getCorrelationId(req);
    safeLog('info', '[games] Creating game with max_participants', {
      correlationId,
      selectedMaxParticipants: max_participants,
      validatedMaxParticipants,
      fid,
    });

    // Determine if this is a paid game (requires on-chain registration)
    const isPaidGame = entry_fee_amount && parseFloat(String(entry_fee_amount)) > 0;
    
    // CRITICAL FIX: Skip on-chain game creation for wheel games without entry fees
    const needsOnChainCreation = isPaidGame && gameType !== 'giveaway_wheel';
    
    // Insert game with select to return creds fields for immediate validation (atomic operation)
    // If password was provided, we need to verify creds were persisted before proceeding
    const selectFields = rawPassword && rawPassword.trim() !== '' 
      ? 'id,creds_ciphertext,creds_iv,creds_version,max_participants'
      : 'id,max_participants';
    
    const createdGames = await pokerDb.insert<Game>('games', gameData as any, selectFields);
    const game = Array.isArray(createdGames) ? createdGames[0] : createdGames;
    
    // ATOMIC VALIDATION: If password was provided, verify creds were persisted immediately after insert
    if (rawPassword && rawPassword.trim() !== '') {
      const storedCiphertext = (game as any).creds_ciphertext;
      const storedIv = (game as any).creds_iv;
      
      if (!storedCiphertext || storedCiphertext.trim() === '' || !storedIv || storedIv.trim() === '') {
        // Credentials not persisted - delete the game row to prevent orphaned games
        try {
          await pokerDb.delete('games', { id: game.id });
          safeLog('info', '[games] Deleted orphaned game due to failed credentials persistence', {
            correlationId,
            gameId: game.id,
            fid,
            hasPassword: true,
            passwordLen: rawPassword.length,
            hasStoredCiphertext: !!storedCiphertext,
            hasStoredIv: !!storedIv,
          });
        } catch (deleteError: any) {
          // Log but don't fail - the validation error is the primary concern
          safeLog('error', '[games] Failed to delete orphaned game after credentials validation failure', {
            correlationId,
            gameId: game.id,
            fid,
            deleteError: deleteError.message,
          });
        }
        
        safeLog('error', '[games] Password provided but credentials not persisted in DB', {
          correlationId,
          gameId: game.id,
          fid,
          hasPassword: true,
          passwordLen: rawPassword.length,
          hasStoredCiphertext: !!storedCiphertext,
          hasStoredIv: !!storedIv,
        });
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Failed to persist credentials. Password was not saved. Please contact support." },
          { status: 500 }
        );
      }
      
      // Log credentials encryption metadata (safe - no plaintext)
      const cipherLen = storedCiphertext.length;
      const ivLen = storedIv.length;
      safeLog('info', '[games] Credentials encrypted and stored successfully', {
        correlationId,
        gameId: game.id,
        fid,
        hasPassword: true,
        passwordLen: rawPassword.length,
        cipherLen,
        ivLen,
        creds_version: creds_version || 1,
      });
    }
    
    safeLog('info', '[games] Game created with stored max_participants', {
      correlationId,
      gameId: game.id,
      storedMaxParticipants: (game as any).max_participants,
      fid,
    });

    // Store prize configuration in game_prizes table (before on-chain creation)
    if (prize_configuration && Array.isArray(prize_configuration)) {
      const sorted = prize_configuration.sort((a: any, b: any) => a.position - b.position);
      
      for (const prize of sorted) {
        // Handle multiple NFTs per position
        if (prize.nfts && Array.isArray(prize.nfts)) {
          for (const nft of prize.nfts) {
            await pokerDb.insert('game_prizes', {
              game_id: game.id,
              winner_position: prize.position,
              token_amount: prize.token_amount || null,
              token_currency: prize.token_currency || null,
              nft_contract_address: nft.contract_address,
              nft_token_id: nft.token_id,
              nft_metadata: nft.metadata || null,
            });
          }
        } else {
          // No NFTs, just token prize
          await pokerDb.insert('game_prizes', {
            game_id: game.id,
            winner_position: prize.position,
            token_amount: prize.token_amount || null,
            token_currency: prize.token_currency || null,
            nft_contract_address: null,
            nft_token_id: null,
            nft_metadata: null,
          });
        }
      }
      
      safeLog('info', '[games] Prize configuration stored', {
        correlationId,
        gameId: game.id,
        prizeCount: sorted.length,
        fid,
      });
    }

    // Set initial on-chain status (using game.id as onchain_game_id)
    const onchainGameId = game.id; // Canonical mapping: DB games.id → on-chain gameId
    
    // CRITICAL FIX: Only set on-chain status for games that need on-chain creation
    if (needsOnChainCreation) {
      // Update with pending status and onchain_game_id
      await pokerDb.update('games', 
        { id: game.id },
        {
          onchain_status: 'pending',
          onchain_game_id: onchainGameId,
          onchain_tx_hash: null,
          onchain_error: null,
        }
      );
    } else {
      // Free games and wheel games without entry fees don't need on-chain registration
      await pokerDb.update('games',
        { id: game.id },
        {
          onchain_status: 'active',
          onchain_game_id: null,
          onchain_tx_hash: null,
          onchain_error: null,
        }
      );
    }

    // CRITICAL FIX: Only register on-chain if needed (skip for wheel games without entry fees)
    if (needsOnChainCreation && game.id) {
      const correlationId = getCorrelationId(req); // Define outside try block so it's available in catch
      try {
        const { createGameOnContract } = await import('~/lib/contract-ops');
        const entryFeeAmount = parseFloat(String(entry_fee_amount));
        const entryFeeCurrency = entry_fee_currency || 'USDC';
        
        safeLog('info', '[games] Registering paid game on-chain', {
          correlationId,
          gameId: game.id,
          onchainGameId,
          entryFeeAmount,
          entryFeeCurrency,
        });

        const txHash = await createGameOnContract(
          onchainGameId,
          entryFeeAmount,
          entryFeeCurrency,
          correlationId
        );

        // Update game with on-chain registration success
        // If txHash is 'IDEMPOTENT_SUCCESS', game was already active (treat as success, no tx hash available)
        await pokerDb.update('games', 
          { id: game.id },
          {
            onchain_status: 'active',
            onchain_game_id: onchainGameId,
            onchain_tx_hash: txHash === 'IDEMPOTENT_SUCCESS' ? null : txHash,
            onchain_error: null,
          }
        );

        safeLog('info', '[games] Game registered on-chain successfully', {
          correlationId,
          gameId: game.id,
          txHash,
        });
      } catch (contractError: any) {
        // Contract registration failed - update status but don't fail game creation
        const { safeLog } = await import('~/lib/redaction');
        const errorMessage = contractError.message || String(contractError);
        
        // Redact sensitive info from error message
        const redactedError = errorMessage
          .replace(/0x[a-fA-F0-9]{40}/g, '[REDACTED_ADDRESS]')
          .substring(0, 500); // Truncate long errors

        await pokerDb.update('games',
          { id: game.id },
          {
            onchain_status: 'failed',
            onchain_game_id: game.id, // Still set the expected onchain_game_id
            onchain_tx_hash: null,
            onchain_error: redactedError,
          }
        );

        safeLog('error', '[games] Failed to register game on-chain', {
          correlationId,
          gameId: game.id,
          error: redactedError,
        });

        // Return error response to admin
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `Game created in database but failed to register on-chain: ${redactedError}. Use the recovery endpoint to retry.` 
          },
          { status: 500 }
        );
      }
    }

    // Fetch updated game (with on-chain status)
    const updatedGames = await pokerDb.fetch<Game>('games', {
      filters: { id: game.id },
      limit: 1,
    });
    const updatedGame = updatedGames[0] || game;

    // Hook A: Send notifications to all subscribed users about new game
    // Run in-request but wrapped in try/catch so failures never block game creation
    if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
      try {
        const {
          sendBulkNotifications,
          logNotificationEvent,
          notificationEventExists,
          generateNotificationId,
        } = await import('~/lib/notifications');
        const { APP_URL } = await import('~/lib/constants');
        
        // Get all enabled subscribers (using new schema)
        // CHECK constraint ensures enabled=true -> token IS NOT NULL
        // sendBulkNotifications will filter for valid token/url as additional safety
        const subscriptions = await pokerDb.fetch<any>('notification_subscriptions', {
          filters: { enabled: true },
          select: 'fid',
        });

        if (!subscriptions || subscriptions.length === 0) {
          safeLog('info', '[games][notifications] No enabled subscribers found', { gameId: game.id });
        } else {
          const subscriberFids = subscriptions.map((s: any) => s.fid);
          
          // Debug logging
          safeLog('info', '[games][notifications] Sending game_created notifications', {
            gameId: game.id,
            enabledSubscriberCount: subscriberFids.length,
          });
          
          // Build notification payload
          const buyInAmount = (game as any).buy_in_amount || 0;
          const buyInCurrency = (game as any).buy_in_currency || 'USDC';
          const maxParticipants = (game as any).max_participants;
          const currentCount = 0; // New game, no participants yet

          const notificationBody = maxParticipants
            ? `Buy-in: ${buyInAmount} ${buyInCurrency}. Players: ${currentCount}/${maxParticipants}.`
            : `Buy-in: ${buyInAmount} ${buyInCurrency}. Open to all players.`;

          // Generate stable notification ID
          const notificationId = generateNotificationId('game_created', game.id);

          // Send notifications in bulk (with timeout handled inside)
          const results = await sendBulkNotifications(
            subscriberFids,
            {
              title: 'New Giveaway Games game',
              body: notificationBody,
              targetUrl: new URL(`/games/${game.id}?fromNotif=game_created`, APP_URL).href,
            },
            notificationId
          );

          // Log notification events (UPSERT handles idempotency - only skips if status='sent')
          for (const result of results) {
            if (result.fid !== undefined) {
              // Check if already sent (skip retry if successful)
              const alreadySent = await notificationEventExists('game_created', game.id, result.fid);
              if (!alreadySent) {
                await logNotificationEvent(
                  'game_created',
                  game.id,
                  result.fid,
                  result.success ? 'sent' : 'failed',
                  result.error
                );
              }
            }
          }

          safeLog('info', '[games][notifications] Game creation notifications completed', {
            gameId: game.id,
            subscriberCount: subscriberFids.length,
            successCount: results.filter(r => r.success).length,
            failedCount: results.filter(r => !r.success).length,
          });
        }
      } catch (notificationError: any) {
        // Log but don't throw - game creation should succeed even if notifications fail
        safeLog('error', '[games][notifications] Failed to send game creation notifications', {
          gameId: game.id,
          error: notificationError?.message || String(notificationError),
        });
      }
    }

    return NextResponse.json<ApiResponse<Game>>({
      ok: true,
      data: updatedGame,
    });
  } catch (error: any) {
    const { safeLog } = await import('~/lib/redaction');
    const { getCorrelationId } = await import('~/lib/correlation-id');
    const correlationId = getCorrelationId(req);
    
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code;
    
    // Handle auth errors
    if (errorMessage?.includes('authentication') || errorMessage?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: errorMessage },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (errorMessage?.includes('owner') || errorMessage?.includes('permission')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: errorMessage },
        { status: 403 }
      );
    }
    
    // Check if this is a schema cache / missing column error (PGRST204)
    if (errorCode === 'PGRST204' || (typeof errorMessage === 'string' && errorMessage.includes('PGRST204'))) {
      // Check if it's specifically about game_type or registration_close_minutes
      if (typeof errorMessage === 'string' && (
        errorMessage.includes('game_type') || 
        errorMessage.includes('registration_close_minutes')
      )) {
        safeLog('error', '[API][games] Missing migration: large_event columns', {
          correlationId,
          errorCode: 'PGRST204',
        });
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: 'Database is missing migrations for large_event support (games.game_type). Run supabase_migration_games_large_event_columns.sql and reload PostgREST schema.' 
          },
          { status: 503 }
        );
      }
    }

    safeLog('error', '[API][games] Create error', {
      correlationId,
      errorCode,
      error: errorMessage,
    });
    
    return NextResponse.json<ApiResponse>(
      { ok: false, error: errorMessage || "Failed to create game" },
      { status: 500 }
    );
  }
}
