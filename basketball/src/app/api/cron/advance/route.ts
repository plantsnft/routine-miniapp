import { NextRequest, NextResponse } from 'next/server';
import { basketballDb } from '~/lib/basketballDb';
import { simulateGameNight } from '~/lib/gameSimulation';
import { processOffseason } from '~/lib/offseason';

/**
 * POST /api/cron/advance
 * 
 * Cron endpoint to advance the season by one day.
 * 
 * This endpoint:
 * - Processes OFFDAY: Applies TRAIN effects, increments day, flips to GAMENIGHT
 * - Processes GAMENIGHT: Simulates games, increments day, flips to OFFDAY, handles phase transitions
 * 
 * Timezone: All processing uses Eastern Time (cron runs at midnight ET = 5:00 UTC)
 * 
 * Security: Should be protected by Vercel cron secret or IP allowlist in production
 */
export async function POST(req: NextRequest) {
  try {
    // Optional: Verify cron secret (for production)
    // const authHeader = req.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    // }

    // Get current season state
    const seasonState = await basketballDb.fetch('season_state', { limit: 1 });
    if (seasonState.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'League not initialized' },
        { status: 400 }
      );
    }

    const state = seasonState[0];

    if (state.day_type === 'OFFDAY') {
      // Process OFFDAY
      await processOffday(state.season_number, state.day_number, state.phase);

      // Increment day and flip to GAMENIGHT
      await basketballDb.update(
        'season_state',
        { id: state.id },
        {
          day_number: state.day_number + 1,
          day_type: 'GAMENIGHT',
        }
      );

      return NextResponse.json({
        ok: true,
        message: `Offday processed. Advanced to Day ${state.day_number + 1} (GAMENIGHT)`,
        new_day: state.day_number + 1,
        new_day_type: 'GAMENIGHT',
      });
    } else if (state.day_type === 'GAMENIGHT') {
      // Process GAMENIGHT
      await processGamenight(state.season_number, state.day_number, state.phase);

      // Determine new phase
      // Day-to-GameNight mapping: Day 2 = GameNight 1, Day 4 = GameNight 2, ..., Day 54 = GameNight 27, Day 56 = GameNight 28, Day 58 = GameNight 29, Day 60 = GameNight 30
      const gameNightNumber = state.day_number / 2;
      let newPhase = state.phase;
      if (state.phase === 'REGULAR' && gameNightNumber === 27) {
        // After GameNight 27 (day 54, last regular season game), transition to PLAYOFFS
        newPhase = 'PLAYOFFS';
      } else if (state.phase === 'PLAYOFFS' && gameNightNumber === 30) {
        // After GameNight 30 (day 60, last playoff game), transition to OFFSEASON
        newPhase = 'OFFSEASON';
      }

      // Auto-trigger offseason processing if transitioning to OFFSEASON (Section 16.1)
      if (newPhase === 'OFFSEASON' && state.phase !== 'OFFSEASON') {
        try {
          // Process offseason: aging, retirement, progression, contracts, draft
          // This will reset season state to new season (day 1, REGULAR, OFFDAY)
          const nextSeason = await processOffseason();
          
          return NextResponse.json({
            ok: true,
            message: `Gamenight processed. Offseason completed automatically. Season ${nextSeason} ready to begin.`,
            new_season: nextSeason,
            new_day: 1,
            new_day_type: 'OFFDAY',
            new_phase: 'REGULAR',
          });
        } catch (offseasonError) {
          // If offseason processing fails, log error and keep phase as OFFSEASON for manual retry
          console.error('[Cron Advance] Offseason processing failed:', offseasonError);
          // Still update to OFFSEASON phase so admin can manually retry
          const newDayNumber = state.day_number + 1;
          await basketballDb.update(
            'season_state',
            { id: state.id },
            {
              day_number: newDayNumber,
              day_type: 'OFFDAY',
              phase: 'OFFSEASON',
            }
          );
          
          return NextResponse.json({
            ok: false,
            error: `Gamenight processed but offseason failed: ${offseasonError instanceof Error ? offseasonError.message : 'Unknown error'}. Please process offseason manually.`,
            new_day: newDayNumber,
            new_day_type: 'OFFDAY',
            new_phase: 'OFFSEASON',
          });
        }
      }

      // Increment day and flip to OFFDAY
      const newDayNumber = state.day_number + 1;
      const newDayType: 'OFFDAY' | 'GAMENIGHT' = 'OFFDAY';

      // After day 30 (last playoff game), we transition to OFFSEASON
      // Day 31 is the first day of OFFSEASON (OFFDAY)
      // Offseason processing is now automatic (see above)
      if (newDayNumber > 60) {
        // Season complete (shouldn't happen, but safety check)
        return NextResponse.json(
          { ok: false, error: 'Season complete. Cannot advance further.' },
          { status: 400 }
        );
      }

      await basketballDb.update(
        'season_state',
        { id: state.id },
        {
          day_number: newDayNumber,
          day_type: newDayType,
          phase: newPhase,
        }
      );

      return NextResponse.json({
        ok: true,
        message: `Gamenight processed. Advanced to Day ${newDayNumber} (${newDayType})`,
        new_day: newDayNumber,
        new_day_type: newDayType,
        new_phase: newPhase,
      });
    } else {
      return NextResponse.json(
        { ok: false, error: `Unknown day_type: ${state.day_type}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[Cron Advance] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to advance day',
      },
      { status: 500 }
    );
  }
}

/**
 * Process OFFDAY:
 * - Apply TRAIN effects to players (if TRAIN action was chosen)
 * - Note: PREP boost is set when action is submitted, not consumed here
 */
async function processOffday(
  seasonNumber: number,
  dayNumber: number,
  phase: string
): Promise<void> {
  // Load all offday actions for this day
  const offdayActions = await basketballDb.fetch('offday_actions', {
    filters: {
      season_number: seasonNumber,
      day_number: dayNumber,
    },
  });

  // Process TRAIN actions
  for (const action of offdayActions) {
    if (action.action === 'TRAIN') {
      // Get all players for this team
      const players = await basketballDb.fetch('players', {
        filters: {
          team_id: action.team_id,
        },
      });

      // Apply training to each player
      for (const player of players) {
        // Formula: newRating = min(tierCap, rating * 1.001)
        const newRating = Math.min(
          getTierCap(player.tier),
          player.rating * 1.001
        );

        // Update player rating
        await basketballDb.update(
          'players',
          { id: player.id },
          { rating: newRating }
        );
      }
    }
    // PREP actions don't need processing here - flag is already set when submitted
  }
}

/**
 * Process GAMENIGHT:
 * - Simulate all scheduled games for this day
 * - Handle phase transitions if needed
 */
async function processGamenight(
  seasonNumber: number,
  dayNumber: number,
  phase: string
): Promise<void> {
  // Simulate games for this game night
  await simulateGameNight(seasonNumber, dayNumber);

  // Phase transitions are handled in the main function after simulation
  // (REGULAR → PLAYOFFS after day 27, PLAYOFFS → OFFSEASON after day 30)
}

/**
 * Get tier cap for a player tier
 */
function getTierCap(tier: string): number {
  switch (tier) {
    case 'good':
      return 80;
    case 'great':
      return 90;
    case 'elite':
      return 99;
    default:
      return 99; // Fallback
  }
}
