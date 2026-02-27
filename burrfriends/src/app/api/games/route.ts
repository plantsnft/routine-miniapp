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
    // Sort by is_pinned first (pinned games on top), then inserted_at descending
    const gamesRaw = await pokerDb.fetch<any>('burrfriends_games', {
      select: '*',
      filters,
      order: 'is_pinned.desc,inserted_at.desc',
    });

    // Fetch participant counts for all games (only count status='joined')
    const participantCounts: Record<string, number> = {};
    for (const game of gamesRaw) {
      try {
        const participants = await pokerDb.fetch<any>('burrfriends_participants', {
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
        const viewerParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
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
      
      // Calculate total prize amount (sum of all prize_amounts)
      const prizeAmounts = Array.isArray(g.prize_amounts) ? g.prize_amounts : [];
      const totalPrizeAmount = prizeAmounts.length > 0
        ? prizeAmounts.reduce((sum: number, amt: any) => sum + parseFloat(String(amt || 0)), 0)
        : null;
      
      const baseGame = {
        ...normalized,
        scheduled_time: g.game_date || null,
        title: g.name || null,
        max_participants: g.max_participants ?? null,
        game_type: g.game_type || 'standard',
        registration_close_minutes: g.registration_close_minutes ?? 0,
        participant_count: participantCounts[g.id] || 0, // Count of participants with status='joined'
        viewer_has_joined: viewerJoinedStatus[g.id] || false, // Whether the current viewer has joined this game
        // Prize configuration fields
        prize_amounts: prizeAmounts.length > 0 ? prizeAmounts.map((amt: any) => parseFloat(String(amt))) : null,
        prize_currency: g.prize_currency || null,
        number_of_winners: g.number_of_winners || null,
        total_prize_amount: totalPrizeAmount,
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
  // Store notification data for async sending after response
  let pendingNotifications: {
    subscriberFids: number[];
    title: string;
    body: string;
    targetUrl: string;
    notificationId: string;
    gameId: string;
  } | null = null;
  
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
      entry_fee_amount, // DEPRECATED: Keep for backward compatibility but ignore
      entry_fee_currency, // DEPRECATED: Keep for backward compatibility but ignore
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
      game_setup_type, // 'sit_and_go' | 'scheduled'
      number_of_winners, // NEW: Required for prize-based games
      prize_amounts, // NEW: Required array of prize amounts
      prize_currency, // NEW: Currency for prizes (default 'BETR')
      apply_staking_multipliers, // Tournament staking multiplier option (default true)
      double_payout_if_bb, // Tournament double BB option (default false)
      is_sunday_high_stakes, // Phase 32: Sunday High Stakes (scheduled only)
      community: communityRaw, // Phase 36: Multi-community support
    } = body;
    const community: 'betr' | 'minted_merch' = communityRaw === 'minted_merch' ? 'minted_merch' : 'betr';

    if (!club_id) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing required field: club_id" },
        { status: 400 }
      );
    }

    // Validate prize configuration (required for prize-based games)
    if (!number_of_winners || number_of_winners < 1 || number_of_winners > 10) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "number_of_winners must be between 1 and 10" },
        { status: 400 }
      );
    }

    if (!prize_amounts || !Array.isArray(prize_amounts) || prize_amounts.length !== number_of_winners) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "prize_amounts must be array with length matching number_of_winners" },
        { status: 400 }
      );
    }

    if (prize_amounts.some((amt: any) => parseFloat(String(amt)) <= 0)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "All prize amounts must be greater than 0" },
        { status: 400 }
      );
    }

    // Validate mutual exclusivity for tournament payout options
    const isScheduled = game_setup_type === 'scheduled' || 
                       (game_setup_type === undefined && scheduled_time); // Fallback check
    
    if (isScheduled) {
      const applyMultipliers = apply_staking_multipliers ?? true;
      const doubleBB = double_payout_if_bb ?? false;
      
      if (applyMultipliers && doubleBB) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Cannot select both 'Apply staking multipliers' and 'Double payout if BB'. Only one option can be selected." },
          { status: 400 }
        );
      }
    }

    // Phase 2: Handle simplified game setup types
    // If game_setup_type is provided, auto-configure fields
    // FIX: Validate game_setup_type to ensure it's a valid value
    if (game_setup_type && game_setup_type !== 'sit_and_go' && game_setup_type !== 'scheduled') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Invalid game_setup_type: ${game_setup_type}. Must be 'sit_and_go' or 'scheduled'` },
        { status: 400 }
      );
    }

    let autoConfiguredMaxParticipants = max_participants;
    let autoConfiguredGameType: 'standard' | 'large_event' | undefined = undefined;
    let autoConfiguredScheduledTime = scheduled_time;
    let autoConfiguredGatingType = gating_type;
    let autoConfiguredStakingTokenContract = staking_token_contract;

    if (game_setup_type === 'sit_and_go') {
      // Sit and Go: 9 players, game_date = null, game_type = 'standard'
      autoConfiguredMaxParticipants = 9;
      autoConfiguredGameType = 'standard';
      autoConfiguredScheduledTime = null; // Starts when full
    } else if (game_setup_type === 'scheduled') {
      // Scheduled: 99 players, game_date = user input, game_type = 'large_event'
      autoConfiguredMaxParticipants = 99;
      autoConfiguredGameType = 'large_event';
      // scheduled_time is already set from user input
    }

    // Handle staking requirements
    if (staking_min_amount && staking_min_amount > 0) {
      // Validate staking threshold is one of the allowed values
      const { isValidStakingThreshold, VALID_STAKING_THRESHOLDS } = await import('~/lib/constants');
      if (!isValidStakingThreshold(staking_min_amount)) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `Invalid staking_min_amount: ${staking_min_amount}. Must be one of: ${VALID_STAKING_THRESHOLDS.map(t => `${t / 1_000_000}M`).join(', ')} BETR or null/0 for no requirement`,
          },
          { status: 400 }
        );
      }
      
      autoConfiguredGatingType = 'stake_threshold';
      // Set staking_token_contract to BETR token address
      const { BETR_TOKEN_ADDRESS } = await import('~/lib/constants');
      autoConfiguredStakingTokenContract = BETR_TOKEN_ADDRESS;
    }

    // Use auto-configured values if game_setup_type was provided
    const finalMaxParticipants = game_setup_type ? autoConfiguredMaxParticipants : max_participants;
    const finalGameType = game_setup_type ? autoConfiguredGameType : undefined;
    const finalScheduledTime = game_setup_type ? autoConfiguredScheduledTime : scheduled_time;
    const finalGatingType = game_setup_type ? autoConfiguredGatingType : gating_type;
    const finalStakingTokenContract = game_setup_type ? autoConfiguredStakingTokenContract : staking_token_contract;

    // SAFETY: Require club ownership
    const { requireClubOwner } = await import("~/lib/pokerPermissions");
    // MVP-only: Require Hellfire club
    const { requireHellfireClub } = await import("~/lib/pokerPermissions");
    await requireHellfireClub(club_id);
    
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
    const defaultName = 'Prize Game'; // Prize-based games have no entry fees
    
    // Check if user is admin
    const { isAdmin } = await import('~/lib/admin');
    const userIsAdmin = isAdmin(fid);
    
    // Infer game_type from max_participants: if blank and admin, treat as open-registration (large_event)
    // Otherwise, use provided game_type or auto-configured game_type or default to standard
    // FIX: Use nullish coalescing to properly respect finalGameType from game_setup_type
    let gameType: 'standard' | 'large_event' = finalGameType ?? (body.game_type === 'large_event' ? 'large_event' : 'standard');
    
    // If max_participants is missing/null/empty and user is admin, infer large_event (open-registration)
    const maxParticipantsValue = finalMaxParticipants;
    const isMaxBlank = maxParticipantsValue === null || 
                       maxParticipantsValue === undefined || 
                       maxParticipantsValue === '' || 
                       maxParticipantsValue === 0 || 
                       String(maxParticipantsValue).trim() === '' ||
                       String(maxParticipantsValue).trim() === '0';
    
    if (isMaxBlank && userIsAdmin) {
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
    
    // FIX: When game_setup_type is provided, use finalMaxParticipants directly (ignore body max_participants)
    // Log warning if body max_participants differs from auto-configured value
    // Note: correlationId will be declared later, so we'll log the warning after it's available
    let shouldLogMaxParticipantsWarning = false;
    let bodyMaxParticipantsValue: number | null = null;
    
    if (game_setup_type) {
      // Use auto-configured value from game_setup_type
      validatedMaxParticipants = finalMaxParticipants;
      
      // Check if body provided a different max_participants value (log warning later when correlationId is available)
      if (max_participants !== undefined && max_participants !== null && max_participants !== 0 && String(max_participants).trim() !== '' && String(max_participants).trim() !== '0') {
        const bodyMax = parseInt(String(max_participants), 10);
        if (!isNaN(bodyMax) && bodyMax !== finalMaxParticipants) {
          shouldLogMaxParticipantsWarning = true;
          bodyMaxParticipantsValue = bodyMax;
        }
      }
    } else {
      // No game_setup_type: validate body max_participants as before
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
      
      // FIX: If no max_participants is set at all, default to 99
      if (validatedMaxParticipants === null && max_participants === undefined) {
        validatedMaxParticipants = 99;
      }
    }
    
    // Set registration_close_minutes based on game type
    const registrationCloseMinutes = gameType === 'large_event' ? 15 : 0;
    
    // Phase 31: Use custom title if provided, otherwise auto-generate based on game type
    let gameTitle: string;
    if (typeof title === 'string' && title.trim().length > 0) {
      gameTitle = title.trim();
    } else if (game_setup_type === 'sit_and_go' || finalGameType === 'standard' || gameType === 'standard') {
      gameTitle = 'Sit & Go';
    } else if (game_setup_type === 'scheduled' || finalGameType === 'large_event' || gameType === 'large_event') {
      gameTitle = 'Tournament';
    } else {
      // Fallback for edge cases (shouldn't happen in normal flow)
      gameTitle = defaultName;
    }
    
    // Determine gating_type: 'stake_threshold' if staking required, else 'open' (no entry fees)
    // Validate staking threshold if provided
    if (staking_min_amount && staking_min_amount > 0) {
      const { isValidStakingThreshold, VALID_STAKING_THRESHOLDS } = await import('~/lib/constants');
      if (!isValidStakingThreshold(staking_min_amount)) {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: `Invalid staking_min_amount: ${staking_min_amount}. Must be one of: ${VALID_STAKING_THRESHOLDS.map(t => `${t / 1_000_000}M`).join(', ')} BETR or null/0 for no requirement`,
          },
          { status: 400 }
        );
      }
    }
    const determinedGatingType = (staking_min_amount && staking_min_amount > 0) ? 'stake_threshold' : 'open';
    
    const gameData: any = {
      club_id,
      name: gameTitle, // Always use game type-based title (Database uses 'name', API uses 'title')
      description: description || null,
      // Allow null game_date for "start when table is full" games
      // If scheduled_time is explicitly null, set game_date to null
      // If scheduled_time is undefined/not provided, default to current time
      // Otherwise use the provided scheduled_time
      game_date: finalScheduledTime === null ? null : (finalScheduledTime || new Date().toISOString()),
      // buy_in_amount is always 0 for prize-based games (no entry fees)
      buy_in_amount: 0,
      buy_in_currency: 'BETR', // Keep for compatibility, but not used
      gating_type: finalGatingType || determinedGatingType, // 'open' or 'stake_threshold'
      staking_min_amount: staking_min_amount || null,
      staking_token_contract: finalStakingTokenContract || null,
      status: "open", // Use 'open' to match schema default
      max_participants: validatedMaxParticipants, // Include max_participants if provided and valid
      game_type: gameType,
      registration_close_minutes: registrationCloseMinutes,
      // Prize configuration (required for prize-based games)
      prize_amounts: prize_amounts.map((amt: any) => parseFloat(String(amt))), // Ensure numbers
      prize_currency: prize_currency || 'BETR',
      number_of_winners: number_of_winners,
      // Tournament staking multiplier options
      apply_staking_multipliers: apply_staking_multipliers ?? true,  // Default true for backward compat
      double_payout_if_bb: double_payout_if_bb ?? false,            // Default false
      ...(is_sunday_high_stakes ? { is_sunday_high_stakes: true } : {}), // Phase 32: Sunday High Stakes (only sent when true; DB DEFAULT false handles rest — prevents PGRST204 if migration 55 not yet applied)
      // Store encrypted credentials (never plaintext)
      creds_ciphertext,
      creds_iv,
      creds_version,
      // Track who created the game (Phase 18.2)
      created_by_fid: fid,
      // Phase 36: Multi-community support (default 'betr')
      community,
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
    
    // Log warning if body max_participants differed from auto-configured value
    if (shouldLogMaxParticipantsWarning && bodyMaxParticipantsValue !== null) {
      safeLog('warn', '[games] Body max_participants differs from auto-configured value, using auto-configured', {
        correlationId,
        game_setup_type,
        bodyMaxParticipants: bodyMaxParticipantsValue,
        autoConfiguredMaxParticipants: finalMaxParticipants,
        using: finalMaxParticipants,
      });
    }
    
    safeLog('info', '[games] Creating game with auto-configured values', {
      correlationId,
      game_setup_type,
      selectedMaxParticipants: max_participants,
      finalMaxParticipants,
      validatedMaxParticipants,
      finalGameType,
      gameType,
      finalGatingType,
      determinedGatingType,
      staking_min_amount,
      gameTitle, // Log the auto-generated title
      fid,
      usingMaxParticipants: validatedMaxParticipants, // Log the final value being used
    });

    // Prize-based games have no entry fees, so no on-chain registration needed for payments
    // (Games are free to join, prizes distributed via direct transfers)
    const isPaidGame = false; // Always false for prize-based games
    
    // Insert game with select to return creds fields for immediate validation (atomic operation)
    // If password was provided, we need to verify creds were persisted before proceeding
    const selectFields = rawPassword && rawPassword.trim() !== '' 
      ? 'id,creds_ciphertext,creds_iv,creds_version,max_participants'
      : 'id,max_participants';
    
    const createdGames = await pokerDb.insert<Game>('burrfriends_games', gameData as any, selectFields);
    const game = Array.isArray(createdGames) ? createdGames[0] : createdGames;
    
    // ATOMIC VALIDATION: If password was provided, verify creds were persisted immediately after insert
    if (rawPassword && rawPassword.trim() !== '') {
      const storedCiphertext = (game as any).creds_ciphertext;
      const storedIv = (game as any).creds_iv;
      
      if (!storedCiphertext || storedCiphertext.trim() === '' || !storedIv || storedIv.trim() === '') {
        // Credentials not persisted - delete the game row to prevent orphaned games
        try {
          await pokerDb.delete('burrfriends_games', { id: game.id });
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

    // Set initial on-chain status (using game.id as onchain_game_id)
    const onchainGameId = game.id; // Canonical mapping: DB games.id → on-chain gameId
    
    if (isPaidGame) {
      // Update with pending status and onchain_game_id
      await pokerDb.update('burrfriends_games', 
        { id: game.id },
        {
          onchain_status: 'pending',
          onchain_game_id: onchainGameId,
          onchain_tx_hash: null,
          onchain_error: null,
        }
      );
    } else {
      // Free games don't need on-chain registration
      await pokerDb.update('burrfriends_games',
        { id: game.id },
        {
          onchain_status: 'active',
          onchain_game_id: null,
          onchain_tx_hash: null,
          onchain_error: null,
        }
      );
    }

    // For paid games, register on-chain
    if (isPaidGame && game.id) {
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
        await pokerDb.update('burrfriends_games', 
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

        await pokerDb.update('burrfriends_games',
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

    // Fetch updated game (with on-chain status) - includes all fields like buy_in_amount
    const updatedGames = await pokerDb.fetch<Game>('burrfriends_games', {
      filters: { id: game.id },
      select: '*', // Get all fields including buy_in_amount
      limit: 1,
    });
    const updatedGame = updatedGames[0] || game;

    // Hook A: Send notifications to all subscribed users about new game
    // Run in-request but wrapped in try/catch so failures never block game creation
    // OPTIMIZATION: Notifications are now sent asynchronously after response to prevent timeout
    const enableNotifications = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';
    
    // Diagnostic logging for notification status
    safeLog('info', '[games][notifications] Notification check', {
      gameId: game.id,
      enabled: enableNotifications,
      envVarSet: process.env.ENABLE_PUSH_NOTIFICATIONS !== undefined,
      envVarValue: process.env.ENABLE_PUSH_NOTIFICATIONS || 'not set',
    });
    
    // Prepare notifications (but don't send yet - will send after response)
    if (enableNotifications) {
      try {
        const {
          sendBulkNotifications,
          logNotificationEvent,
          notificationEventExists,
          generateNotificationId,
        } = await import('~/lib/notifications');
        const { APP_URL } = await import('~/lib/constants');
        const { formatPrizeWithCurrency, formatPrizeAmount } = await import('~/lib/format-prize');
        
        // Get all enabled subscribers (using new schema)
        // CHECK constraint ensures enabled=true -> token IS NOT NULL
        // sendBulkNotifications will filter for valid token/url as additional safety
        const subscriptions = await pokerDb.fetch<any>('notification_subscriptions', {
          filters: { enabled: true },
          select: 'fid',
        });

        safeLog('info', '[games][notifications] Subscriptions fetched', {
          gameId: game.id,
          subscriptionCount: subscriptions?.length || 0,
        });

        // Enhanced diagnostic logging
        safeLog('info', '[games][notifications] Subscription details', {
          gameId: game.id,
          totalSubscriptions: subscriptions?.length || 0,
          subscriptionFids: subscriptions?.map((s: any) => s.fid) || [],
          hasStakingRequirement: !!(gameData.staking_min_amount && gameData.staking_min_amount > 0),
          stakingMinAmount: gameData.staking_min_amount || null,
        });

        if (!subscriptions || subscriptions.length === 0) {
          safeLog('info', '[games][notifications] No enabled subscribers found', { gameId: game.id });
        } else {
          // OPTIMIZATION: Skip staking checks for notifications to prevent timeout
          // Business decision: Notifications are informational, not gated by staking requirements
          // Sending to all subscribers ensures everyone is informed about new games
          const subscriberFids = subscriptions.map((s: any) => s.fid);
          
          safeLog('info', '[games][notifications] Sending to all subscribers (staking checks skipped for performance)', {
            gameId: game.id,
            enabledSubscriberCount: subscriberFids.length,
            stakingMinAmount: gameData.staking_min_amount || null,
            note: 'Staking checks skipped - notifications sent to all subscribers',
          });
          
          // Build notification payload
          // Use updatedGame which has all fields including buy_in_amount (not the initial game object from insert)
          const gameForNotification = updatedGame || game;
          const maxParticipants = (gameForNotification as any).max_participants;
          const currentCount = 0; // New game, no participants yet
          
          // Get game name for notification title (e.g., "Sit & Go" or "Tournament")
          const gameName = (gameForNotification as any).name || (game as any).name || 'BETR WITH BURR game';
          const notificationTitle = `New ${gameName}`;
          
          // Check if this is a prize-based game
          const prizeAmounts = (gameForNotification as any).prize_amounts;
          const isPrizeBasedGame = Array.isArray(prizeAmounts) && prizeAmounts.length > 0;
          
          // Get staking requirement
          const stakingMinAmount = (gameForNotification as any).staking_min_amount;
          const hasStakingRequirement = stakingMinAmount && stakingMinAmount > 0;
          const stakingText = hasStakingRequirement 
            ? ` Staking: ${formatPrizeAmount(stakingMinAmount)} BETR required.`
            : '';
          
          let notificationBody: string;
          
          if (isPrizeBasedGame) {
            // Prize-based game: show total prize amount
            const totalPrize = prizeAmounts.reduce((sum: number, amt: number) => sum + (amt || 0), 0);
            const prizeCurrency = (gameForNotification as any).prize_currency || 'BETR';
            const prizeText = formatPrizeWithCurrency(totalPrize, prizeCurrency);
            
            notificationBody = maxParticipants
              ? `Prize: ${prizeText}. Players: ${currentCount}/${maxParticipants}.${stakingText}`
              : `Prize: ${prizeText}. Open to all players.${stakingText}`;
          } else {
            // Paid game: show entry fee
            const buyInAmount = (gameForNotification as any).buy_in_amount ?? (gameForNotification as any).entry_fee_amount ?? 0;
            const buyInCurrency = (gameForNotification as any).buy_in_currency ?? (gameForNotification as any).entry_fee_currency ?? 'USDC';
            
            // Format amount to always show at least 2 decimal places (e.g., 0.02, 0.03 instead of 0)
            const formattedAmount = typeof buyInAmount === 'number' && buyInAmount > 0
              ? buyInAmount.toFixed(2) 
              : parseFloat(String(buyInAmount || 0)).toFixed(2);

            notificationBody = maxParticipants
              ? `Buy-in: ${formattedAmount} ${buyInCurrency}. Players: ${currentCount}/${maxParticipants}.${stakingText}`
              : `Buy-in: ${formattedAmount} ${buyInCurrency}. Open to all players.${stakingText}`;
          }

          // Generate stable notification ID
          const notificationId = generateNotificationId('game_created', game.id);

          // Store notification data for async sending (after response is returned)
          const notificationPayload = {
            subscriberFids,
            title: notificationTitle,
            body: notificationBody,
            targetUrl: new URL(`/games/${game.id}?fromNotif=game_created`, APP_URL).href,
            notificationId,
            gameId: game.id,
          };

          // Store for async execution after response
          pendingNotifications = notificationPayload;
        }
      } catch (notificationError: any) {
        // Log but don't throw - game creation should succeed even if notifications fail
        safeLog('error', '[games][notifications] Failed to send game creation notifications', {
          gameId: game.id,
          error: notificationError?.message || String(notificationError),
          stack: notificationError?.stack,
        });
      }
    } else {
      // Notifications disabled - log for diagnostics
      safeLog('info', '[games][notifications] Notifications disabled - skipping', {
        gameId: game.id,
        envVarValue: process.env.ENABLE_PUSH_NOTIFICATIONS || 'not set',
      });
    }

    // Return response immediately to prevent timeout
    const response = NextResponse.json<ApiResponse<Game>>({
      ok: true,
      data: updatedGame,
    });

    // Send notifications asynchronously after response is returned (non-blocking)
    // Use Next.js after() API to ensure async work completes even after response is sent
    // This prevents timeout issues while still sending notifications
    if (enableNotifications && pendingNotifications) {
      // Capture for TypeScript: after() callback runs async; TS doesn't narrow closed-over vars.
      const payload = pendingNotifications;
      const { after } = await import('next/server');
      
      after(async () => {
        try {
          const {
            sendBulkNotifications,
            logNotificationEvent,
            notificationEventExists,
          } = await import('~/lib/notifications');
          
          safeLog('info', '[games][notifications] Starting async notification send', {
            gameId: payload.gameId,
            subscriberCount: payload.subscriberFids.length,
          });

          // Send notifications in bulk (with timeout handled inside)
          const results = await sendBulkNotifications(
            payload.subscriberFids,
            {
              title: payload.title,
              body: payload.body,
              targetUrl: payload.targetUrl,
            },
            payload.notificationId
          );

          // Log notification events (UPSERT handles idempotency - only skips if status='sent')
          for (const result of results) {
            if (result.fid !== undefined) {
              // Check if already sent (skip retry if successful)
              const alreadySent = await notificationEventExists('game_created', payload.gameId, result.fid);
              if (!alreadySent) {
                await logNotificationEvent(
                  'game_created',
                  payload.gameId,
                  result.fid,
                  result.success ? 'sent' : 'failed',
                  result.error
                );
              }
            }
          }

          const successCount = results.filter(r => r.success).length;
          const failedCount = results.filter(r => !r.success).length;
          
          safeLog('info', '[games][notifications] Async notification send completed', {
            gameId: payload.gameId,
            subscriberCount: payload.subscriberFids.length,
            successCount,
            failedCount,
            failedFids: results.filter(r => !r.success).map(r => r.fid).filter(Boolean),
          });
          
          // Log warning if notifications failed
          if (failedCount > 0) {
            safeLog('warn', '[games][notifications] Some async notifications failed', {
              gameId: payload.gameId,
              failedCount,
              totalSubscribers: payload.subscriberFids.length,
            });
          }
        } catch (asyncError: any) {
          // Log but don't throw - notifications are best-effort
          safeLog('error', '[games][notifications] Async notification send failed', {
            gameId: payload.gameId,
            error: asyncError?.message || String(asyncError),
            stack: asyncError?.stack,
          });
        }
      });
    }

    return response;
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
