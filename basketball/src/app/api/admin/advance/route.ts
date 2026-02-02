import { NextRequest, NextResponse } from 'next/server';
import { basketballDb } from '~/lib/basketballDb';
import { simulateGameNight } from '~/lib/gameSimulation';

/**
 * POST /api/admin/advance
 * 
 * Admin endpoint to manually advance the season by one day.
 * Same logic as cron/advance but can be triggered manually.
 */
export async function POST(req: NextRequest) {
  try {
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
      const gameNightNumber = state.day_number / 2;
      let newPhase = state.phase;
      if (state.phase === 'REGULAR' && gameNightNumber === 27) {
        newPhase = 'PLAYOFFS';
      } else if (state.phase === 'PLAYOFFS' && gameNightNumber === 30) {
        newPhase = 'OFFSEASON';
      }

      // Increment day and flip to OFFDAY
      const newDayNumber = state.day_number + 1;
      const newDayType: 'OFFDAY' | 'GAMENIGHT' = 'OFFDAY';

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
    console.error('[Admin Advance] Error:', error);
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
 * Process OFFDAY: Apply TRAIN effects
 */
async function processOffday(
  seasonNumber: number,
  dayNumber: number,
  phase: string
): Promise<void> {
  const offdayActions = await basketballDb.fetch('offday_actions', {
    filters: {
      season_number: seasonNumber,
      day_number: dayNumber,
    },
  });

  for (const action of offdayActions) {
    if (action.action === 'TRAIN') {
      const players = await basketballDb.fetch('players', {
        filters: { team_id: action.team_id },
      });

      for (const player of players) {
        const newRating = Math.min(
          getTierCap(player.tier),
          player.rating * 1.001
        );

        await basketballDb.update(
          'players',
          { id: player.id },
          { rating: newRating }
        );
      }
    }
  }
}

/**
 * Process GAMENIGHT: Simulate games
 */
async function processGamenight(
  seasonNumber: number,
  dayNumber: number,
  phase: string
): Promise<void> {
  await simulateGameNight(seasonNumber, dayNumber);
}

function getTierCap(tier: string): number {
  switch (tier) {
    case 'good':
      return 80;
    case 'great':
      return 90;
    case 'elite':
      return 99;
    default:
      return 99;
  }
}
