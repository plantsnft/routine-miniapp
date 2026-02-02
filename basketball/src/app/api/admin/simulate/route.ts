import { NextRequest, NextResponse } from 'next/server';
import { basketballDb } from '~/lib/basketballDb';
import { simulateGameNight } from '~/lib/gameSimulation';

/**
 * POST /api/admin/simulate
 * 
 * Admin endpoint to simulate games for the current game night.
 * 
 * Requirements:
 * - Current day must be GAMENIGHT
 * - User must be admin (checked via profile.is_admin)
 * 
 * This endpoint:
 * 1. Validates current day is GAMENIGHT
 * 2. Simulates all scheduled games for this day
 * 3. Updates all stats
 * 4. Consumes prep boosts
 * 
 * Note: Day advancement happens in Phase 5 (cron), not here.
 * This endpoint only simulates games for the current day.
 */
export async function POST(req: NextRequest) {
  try {
    // TODO: Add admin check in Phase 5 when we have proper auth
    // For MVP, we'll allow this since all users are admin
    // const profile = await getProfileFromRequest(req);
    // if (!profile || !profile.is_admin) {
    //   return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
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

    // Validate it's a GAMENIGHT
    if (state.day_type !== 'GAMENIGHT') {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot simulate games on ${state.day_type}. Current day must be GAMENIGHT.`,
          current_day_type: state.day_type,
        },
        { status: 400 }
      );
    }

    // Simulate games for this game night
    await simulateGameNight(state.season_number, state.day_number);

    return NextResponse.json({
      ok: true,
      message: `Games simulated successfully for Season ${state.season_number}, Day ${state.day_number}`,
      season_number: state.season_number,
      day_number: state.day_number,
    });
  } catch (error) {
    console.error('[Simulate] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to simulate games',
      },
      { status: 500 }
    );
  }
}
