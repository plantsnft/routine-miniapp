/**
 * Shared game creation logic
 * 
 * This module contains the core game creation logic that can be reused
 * by both the normal game creation endpoint and the game request approval flow.
 */

import { pokerDb } from "~/lib/pokerDb";
import { encryptCreds } from "~/lib/crypto/credsVault";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import type { Game } from "~/lib/types";

export interface CreateGamePayload {
  club_id: string;
  title?: string;
  description?: string;
  scheduled_time?: string;
  entry_fee_amount?: number | string;
  entry_fee_currency?: string;
  max_participants?: number | string;
  payout_bps?: number[];
  game_password?: string;
  game_username?: string;
  game_type?: 'standard' | 'large_event'; // New field for game type
  [key: string]: any; // Allow other fields
}

export interface CreateGameResult {
  game: Game;
  correlationId: string;
}

/**
 * Create a game from a payload (shared logic)
 * 
 * This function handles:
 * - Credential encryption
 * - Game data validation
 * - Database insertion
 * - On-chain registration (for paid games)
 * - Notification sending (if enabled)
 * 
 * @param payload - Game creation payload (matches POST /api/games format)
 * @param fid - FID of the creator (for logging)
 * @param correlationId - Optional correlation ID (generated if not provided)
 * @returns Created game and correlation ID
 */
export async function createGameFromPayload(
  payload: CreateGamePayload,
  fid: number,
  correlationId?: string
): Promise<CreateGameResult> {
  const corrId = correlationId || getCorrelationId();
  
  const {
    club_id,
    title,
    description,
    scheduled_time,
    gating_type,
    entry_fee_amount,
    entry_fee_currency,
    max_participants,
    payout_bps,
  } = payload;

  if (!club_id) {
    throw new Error("Missing required field: club_id");
  }

  // NOTE: Payload validation should be done by the caller (approve endpoint)
  // This function trusts that the payload has been validated and sanitized
  // We don't re-validate here to avoid duplication, but the approve endpoint
  // calls validateAndSanitizeGameRequestPayload before calling this function

  // Encrypt ClubGG credentials if provided
  let creds_ciphertext = null;
  let creds_iv = null;
  let creds_version = null;
  
  // Unified password extraction
  const rawPassword =
    payload.game_password ??
    payload.password ??
    payload.clubggPassword ??
    payload.clubgg_password ??
    payload.creds?.password ??
    payload.credentials?.password ??
    "";
  
  // Unified username extraction (optional)
  const rawUsername =
    payload.game_username ??
    payload.clubgg_username ??
    payload.clubggUsername ??
    payload.creds?.username ??
    payload.credentials?.username ??
    "";
  
  // Encrypt if password is provided
  if (rawPassword && rawPassword.trim() !== '') {
    const passwordLen = rawPassword.length;
    
    const encryptionKey = process.env.POKER_CREDS_ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.trim() === '') {
      safeLog('error', '[game-creation] Password provided but encryption key missing', {
        correlationId: corrId,
        fid,
        hasPassword: true,
        passwordLen,
      });
      throw new Error("Server misconfigured: missing creds encryption key. Cannot store password.");
    }
    
    try {
      const encrypted = encryptCreds({
        username: rawUsername?.trim() || '',
        password: rawPassword.trim(),
      });
      creds_ciphertext = encrypted.ciphertextB64;
      creds_iv = encrypted.ivB64;
      creds_version = encrypted.version;
      
      if (!creds_ciphertext || creds_ciphertext.trim() === '' || !creds_iv || creds_iv.trim() === '') {
        safeLog('error', '[game-creation] Encryption succeeded but produced empty ciphertext/iv', {
          correlationId: corrId,
          fid,
          hasPassword: true,
          passwordLen,
        });
        throw new Error("Failed to encrypt credentials: encryption produced empty result");
      }
    } catch (encryptError: any) {
      safeLog('error', '[game-creation] Failed to encrypt credentials', {
        correlationId: corrId,
        fid,
        hasPassword: true,
        passwordLen,
        error: encryptError.message,
      });
      throw new Error(`Failed to encrypt credentials: ${encryptError.message}`);
    }
  }

  // Build game object matching database schema
  const defaultName = entry_fee_amount 
    ? `${entry_fee_amount} ${entry_fee_currency || 'USDC'} Game`
    : 'Entry Fee Game';
  
  // Check if user is admin
  const { isAdmin } = await import('~/lib/admin');
  const userIsAdmin = isAdmin(fid);
  
  // Infer game_type from max_participants: if blank and admin, treat as open-registration (large_event)
  // Otherwise, use provided game_type or default to standard
  let gameType: 'standard' | 'large_event' = payload.game_type === 'large_event' ? 'large_event' : 'standard';
  
  // If max_participants is missing/null/empty and user is admin, infer large_event (open-registration)
  const isMaxBlank = max_participants === null || 
                     max_participants === undefined || 
                     max_participants === '' || 
                     max_participants === 0 || 
                     String(max_participants).trim() === '' ||
                     String(max_participants).trim() === '0';
  
  if (isMaxBlank && userIsAdmin) {
    gameType = 'large_event'; // Open-registration mode
  }
  
  // Validate game type and admin access
  if (gameType === 'large_event' && !userIsAdmin) {
    throw new Error("Only admins can create large_event/open-registration games");
  }
  
  // Validate max_participants based on game type
  // For standard games: preserve existing behavior (no hardcoded cap, use whatever is provided)
  // For large_event: cap at 99, but allow NULL for open-registration
  let validatedMaxParticipants: number | null = null;
  const minParticipants = 2;
  
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
          throw new Error("max_participants must be between 2 and 99 for large_event games");
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
  const finalGatingType = gating_type || determinedGatingType;
  
  const gameData: any = {
    club_id,
    name: title || defaultName,
    description: description || null,
    game_date: scheduled_time || new Date().toISOString(),
    buy_in_amount: entry_fee_amount ? parseFloat(String(entry_fee_amount)) : null,
    buy_in_currency: entry_fee_currency || 'USD',
    gating_type: finalGatingType, // Include gating_type for database
    status: "open",
    max_participants: validatedMaxParticipants,
    game_type: gameType,
    registration_close_minutes: registrationCloseMinutes,
    creds_ciphertext,
    creds_iv,
    creds_version,
  };
  
  // Add payout_bps if provided
  if (payout_bps !== undefined && payout_bps !== null) {
    if (Array.isArray(payout_bps) && payout_bps.length > 0) {
      const validatedBps = payout_bps.map(Number).filter(Number.isInteger);
      if (validatedBps.length === payout_bps.length) {
        gameData.payout_bps = validatedBps;
      }
    }
  }
  
  safeLog('info', '[game-creation] Creating game', {
    correlationId: corrId,
    fid,
    validatedMaxParticipants,
  });

  // Determine if this is a paid game
  const isPaidGame = entry_fee_amount && parseFloat(String(entry_fee_amount)) > 0;
  
  // Insert game
  const selectFields = rawPassword && rawPassword.trim() !== '' 
    ? 'id,creds_ciphertext,creds_iv,creds_version,max_participants'
    : 'id,max_participants';
  
  const createdGames = await pokerDb.insert<Game>('games', gameData as any, selectFields);
  const game = Array.isArray(createdGames) ? createdGames[0] : createdGames;
  
  // Validate credentials were persisted
  if (rawPassword && rawPassword.trim() !== '') {
    const storedCiphertext = (game as any).creds_ciphertext;
    const storedIv = (game as any).creds_iv;
    
    if (!storedCiphertext || storedCiphertext.trim() === '' || !storedIv || storedIv.trim() === '') {
      try {
        await pokerDb.delete('games', { id: game.id });
      } catch (deleteError: any) {
        safeLog('error', '[game-creation] Failed to delete orphaned game', {
          correlationId: corrId,
          gameId: game.id,
          fid,
          deleteError: deleteError.message,
        });
      }
      
      throw new Error("Failed to persist credentials. Password was not saved. Please contact support.");
    }
    
    safeLog('info', '[game-creation] Credentials encrypted and stored successfully', {
      correlationId: corrId,
      gameId: game.id,
      fid,
      hasPassword: true,
      passwordLen: rawPassword.length,
    });
  }
  
  safeLog('info', '[game-creation] Game created', {
    correlationId: corrId,
    gameId: game.id,
    storedMaxParticipants: (game as any).max_participants,
    fid,
  });

  // Set initial on-chain status
  const onchainGameId = game.id;
  
  if (isPaidGame) {
    await pokerDb.update('games', 
      { id: game.id },
      {
        onchain_status: 'pending',
        onchain_game_id: onchainGameId,
        onchain_tx_hash: null,
        onchain_error: null,
      }
    );
    
    // Register on-chain
    try {
      const { createGameOnContract } = await import('~/lib/contract-ops');
      const entryFeeAmount = parseFloat(String(entry_fee_amount));
      const entryFeeCurrency = entry_fee_currency || 'USDC';
      
      safeLog('info', '[game-creation] Registering paid game on-chain', {
        correlationId: corrId,
        gameId: game.id,
        onchainGameId,
        entryFeeAmount,
        entryFeeCurrency,
      });

      const txHash = await createGameOnContract(
        onchainGameId,
        entryFeeAmount,
        entryFeeCurrency,
        corrId
      );

      await pokerDb.update('games', 
        { id: game.id },
        {
          onchain_status: 'active',
          onchain_game_id: onchainGameId,
          onchain_tx_hash: txHash === 'IDEMPOTENT_SUCCESS' ? null : txHash,
          onchain_error: null,
        }
      );

      safeLog('info', '[game-creation] Game registered on-chain successfully', {
        correlationId: corrId,
        gameId: game.id,
        txHash,
      });
    } catch (contractError: any) {
      const errorMessage = contractError.message || String(contractError);
      const redactedError = errorMessage
        .replace(/0x[a-fA-F0-9]{40}/g, '[REDACTED_ADDRESS]')
        .substring(0, 500);

      await pokerDb.update('games',
        { id: game.id },
        {
          onchain_status: 'failed',
          onchain_game_id: game.id,
          onchain_tx_hash: null,
          onchain_error: redactedError,
        }
      );

      safeLog('error', '[game-creation] Failed to register game on-chain', {
        correlationId: corrId,
        gameId: game.id,
        error: redactedError,
      });
      
      // Don't throw - game was created, just on-chain registration failed
    }
  } else {
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

  // Fetch updated game
  const updatedGames = await pokerDb.fetch<Game>('games', {
    filters: { id: game.id },
    limit: 1,
  });
  const updatedGame = updatedGames[0] || game;

  // Send notifications (if enabled)
  if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
    try {
      const {
        sendBulkNotifications,
        logNotificationEvent,
        notificationEventExists,
        generateNotificationId,
      } = await import('~/lib/notifications');
      const { APP_URL } = await import('~/lib/constants');
      
      const subscriptions = await pokerDb.fetch<any>('notification_subscriptions', {
        filters: { enabled: true },
        select: 'fid',
      });

      if (subscriptions && subscriptions.length > 0) {
        const subscriberFids = subscriptions.map((s: any) => s.fid);
        
        safeLog('info', '[game-creation][notifications] Sending game_created notifications', {
          gameId: game.id,
          enabledSubscriberCount: subscriberFids.length,
        });
        
        const buyInAmount = (game as any).buy_in_amount || 0;
        const buyInCurrency = (game as any).buy_in_currency || 'USDC';
        const maxParticipants = (game as any).max_participants;
        const currentCount = 0;

        const notificationBody = maxParticipants
          ? `Buy-in: ${buyInAmount} ${buyInCurrency}. Players: ${currentCount}/${maxParticipants}.`
          : `Buy-in: ${buyInAmount} ${buyInCurrency}. Open to all players.`;

        const notificationId = generateNotificationId('game_created', game.id);

        const results = await sendBulkNotifications(
          subscriberFids,
          {
            title: 'New Giveaway Games game',
            body: notificationBody,
            targetUrl: new URL(`/games/${game.id}?fromNotif=game_created`, APP_URL).href,
          },
          notificationId
        );

        for (const result of results) {
          if (result.fid !== undefined) {
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

        safeLog('info', '[game-creation][notifications] Game creation notifications completed', {
          gameId: game.id,
          subscriberCount: subscriberFids.length,
          successCount: results.filter(r => r.success).length,
          failedCount: results.filter(r => !r.success).length,
        });
      }
    } catch (notificationError: any) {
      safeLog('error', '[game-creation][notifications] Failed to send game creation notifications', {
        gameId: game.id,
        error: notificationError?.message || String(notificationError),
      });
      // Don't throw - notifications are best-effort
    }
  }

  return {
    game: updatedGame,
    correlationId: corrId,
  };
}

