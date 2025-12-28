/**
 * Game registration window utilities
 * 
 * Handles registration window logic for different game types:
 * - standard: registration open until full (no time-based closure)
 * - large_event: registration closes 15 minutes after game start time
 */

/**
 * Returns the effective max participants for a game.
 * For open-registration large_event games (max_participants is NULL), returns 99.
 * Otherwise returns the actual max_participants value (or null if not set).
 * 
 * This is the single source of truth for "effective max" used for capacity checks and UI display.
 */
export function getEffectiveMaxParticipants(
  game: {
    game_type?: string | null;
    max_participants?: number | null;
  }
): number | null {
  const gameType = game.game_type || 'standard';
  const maxParticipantsRaw = game.max_participants;
  
  // For large_event with NULL max_participants, effective max is 99 (open-registration)
  if (gameType === 'large_event' && (maxParticipantsRaw === null || maxParticipantsRaw === undefined)) {
    // Debug logging removed - this function must be pure and browser-safe
    // Server-side logging should be done at the API route level if needed
    return 99;
  }
  return maxParticipantsRaw ?? null;
}

/**
 * Compute the registration close time for a game
 * 
 * @param game - Game object with game_type, registration_close_minutes, and scheduled_time
 * @returns ISO string of when registration closes, or null if no start time set
 */
export function computeRegistrationCloseAt(game: {
  game_type?: string | null;
  registration_close_minutes?: number | null;
  scheduled_time?: string | null;
  game_date?: string | null;
}): string | null {
  const startTime = game.scheduled_time || game.game_date;
  if (!startTime) {
    return null; // No start time = registration open until full
  }

  const gameType = game.game_type || 'standard';
  const closeMinutes = game.registration_close_minutes || 0;

  if (gameType === 'large_event' && closeMinutes > 0) {
    // Large event: closes N minutes after start
    const startDate = new Date(startTime);
    const closeDate = new Date(startDate.getTime() + closeMinutes * 60 * 1000);
    return closeDate.toISOString();
  } else {
    // Standard: no time-based closure (returns null = no close time)
    return null;
  }
}

/**
 * Check if registration is currently open for a game
 * 
 * @param game - Game object with status, game_type, registration_close_minutes, scheduled_time, max_participants
 * @param currentParticipantCount - Current number of participants (must be passed in)
 * @param now - Current time (defaults to Date.now())
 * @returns Object with { isOpen: boolean, reason?: string, closeAt?: string }
 */
export function isRegistrationOpen(
  game: {
    status?: string | null;
    game_type?: string | null;
    registration_close_minutes?: number | null;
    scheduled_time?: string | null;
    game_date?: string | null;
    max_participants?: number | null;
  },
  currentParticipantCount: number,
  now: Date = new Date()
): { isOpen: boolean; reason?: string; closeAt?: string | null } {
  // If game is cancelled/settled/closed, registration is closed
  if (game.status === 'cancelled' || game.status === 'settled' || game.status === 'closed') {
    return {
      isOpen: false,
      reason: `Game is ${game.status}`,
    };
  }

  const gameType = game.game_type || 'standard';

  // For standard games: no time-based registration closure (preserve original behavior)
  // Only large_event games have time-based registration windows
  if (gameType !== 'large_event') {
    // Check if full - use effectiveMax
    const effectiveMax = getEffectiveMaxParticipants({
      game_type: gameType,
      max_participants: game.max_participants,
    });
    
    if (effectiveMax !== null && effectiveMax !== undefined) {
      if (currentParticipantCount >= effectiveMax) {
        return {
          isOpen: false,
          reason: 'Game is full',
        };
      }
    }

    return { isOpen: true };
  }

  // For large_event games:
  const closeAt = computeRegistrationCloseAt(game);

  // If no start time, allow registration until full
  if (!closeAt) {
    // Check if full - use effectiveMax
    const effectiveMax = getEffectiveMaxParticipants({
      game_type: gameType,
      max_participants: game.max_participants,
    });
    
    if (effectiveMax !== null && effectiveMax !== undefined) {
      if (currentParticipantCount >= effectiveMax) {
        return {
          isOpen: false,
          reason: 'Game is full',
        };
      }
    }
    return { isOpen: true };
  }

  const closeDate = new Date(closeAt);

  // Check if registration window has closed
  if (now > closeDate) {
    return {
      isOpen: false,
      reason: 'Registration closed',
      closeAt,
    };
  }

  // Check if full - use effectiveMax (handles open-registration large_event with NULL max_participants)
  // Expected behavior:
  // - large_event + max_participants NULL + count 99 => full (isOpen false)
  // - large_event + max_participants NULL + count 98 => open if within window
  const effectiveMax = getEffectiveMaxParticipants({
    game_type: gameType,
    max_participants: game.max_participants,
  });
  
  if (effectiveMax !== null && effectiveMax !== undefined) {
    if (currentParticipantCount >= effectiveMax) {
      return {
        isOpen: false,
        reason: 'Game is full',
        closeAt,
      };
    }
  }

  return {
    isOpen: true,
    closeAt,
  };
}

/**
 * Check if a game has started
 * 
 * @param game - Game object with scheduled_time or game_date
 * @param now - Current time (defaults to Date.now())
 * @returns true if game has started (or no start time set)
 */
export function hasGameStarted(
  game: {
    scheduled_time?: string | null;
    game_date?: string | null;
  },
  now: Date = new Date()
): boolean {
  const startTime = game.scheduled_time || game.game_date;
  if (!startTime) {
    return false; // No start time = not started
  }

  const startDate = new Date(startTime);
  return now >= startDate;
}

/**
 * Get UI badge labels for a game card
 * 
 * Returns at most one primary badge and one info badge to avoid redundancy.
 * 
 * @param game - Game object (can include enriched fields: hasStarted, registrationOpen, registrationCloseAt)
 * @param currentParticipantCount - Current number of participants
 * @param now - Current time (defaults to new Date())
 * @returns Object with { primaryLabel: string | null, infoLabel: string | null }
 */
export function getGameBadges(
  game: {
    status?: string | null;
    game_type?: string | null;
    scheduled_time?: string | null;
    game_date?: string | null;
    registration_close_minutes?: number | null;
    max_participants?: number | null;
    // Enriched fields (optional, will compute if missing)
    hasStarted?: boolean;
    registrationOpen?: boolean;
    registrationCloseAt?: string | null;
  },
  currentParticipantCount: number,
  now: Date = new Date()
): { primaryLabel: string | null; infoLabel: string | null } {
  // Defensive: normalize status
  const status = (game.status || 'open') as string;
  
  // Compute enriched fields with defensive fallback to helpers
  let gameHasStarted: boolean;
  try {
    gameHasStarted = game.hasStarted !== undefined 
      ? game.hasStarted 
      : hasGameStarted(game, now);
  } catch (err) {
    // Fallback: if hasGameStarted throws (shouldn't happen), assume not started
    gameHasStarted = false;
  }
  
  let registrationStatus: { isOpen: boolean; reason?: string; closeAt?: string | null };
  try {
    registrationStatus = game.registrationOpen !== undefined
      ? { isOpen: game.registrationOpen, closeAt: game.registrationCloseAt ?? null }
      : isRegistrationOpen(game, currentParticipantCount, now);
  } catch (err) {
    // Fallback: if isRegistrationOpen throws, assume registration is open
    registrationStatus = { isOpen: true, closeAt: null };
  }

  // Determine primary badge based on game status (defensive: always resolve to valid label)
  let primaryLabel: string | null = null;
  
  if (status === 'settled') {
    primaryLabel = 'Settled';
  } else if (status === 'cancelled') {
    primaryLabel = 'Cancelled';
  } else if (status === 'closed') {
    primaryLabel = 'Closed';
  } else if (gameHasStarted) {
    // Game has started but not settled/cancelled/closed
    if (!registrationStatus.isOpen && status === 'open') {
      // Registration closed but game still active
      primaryLabel = 'Registration closed';
    } else if (registrationStatus.isOpen) {
      // Registration still open - show "Registration open" not "In progress"
      primaryLabel = 'Registration open';
    } else {
      // Game in progress (registration closed)
      primaryLabel = 'In progress';
    }
  } else {
    // Game hasn't started yet and status is open (or default)
    // If registration is open, show "Registration open", otherwise "Open"
    if (registrationStatus.isOpen) {
      primaryLabel = 'Registration open';
    } else {
      primaryLabel = 'Open';
    }
  }

  // Defensive: ensure we always return a label (shouldn't be null, but safety check)
  if (!primaryLabel) {
    primaryLabel = 'Open'; // Safe default
  }

  // Info badge is handled by RegistrationInfoBadge component for dynamic countdowns
  // This helper only returns the primary badge
  // The info badge (countdown/status) should be rendered separately using RegistrationInfoBadge component
  return { primaryLabel, infoLabel: null };
}

