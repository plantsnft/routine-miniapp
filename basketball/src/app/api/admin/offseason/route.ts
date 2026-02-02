import { NextRequest, NextResponse } from 'next/server';
import { processOffseason } from '~/lib/offseason';

/**
 * POST /api/admin/offseason
 * 
 * Admin endpoint to process offseason and draft.
 * 
 * This endpoint:
 * - Applies aging (+1 to all players)
 * - Retires players (age >= 36)
 * - Applies progression/regression
 * - Decrements contracts
 * - Auto-renews expired contracts
 * - Generates draft pool
 * - Executes draft (reverse standings order)
 * - Resets season state for new season
 * 
 * Should be called when phase transitions to OFFSEASON.
 * 
 * Note: This is also called automatically by cron when phase transitions to OFFSEASON (see Section 16.1).
 */
export async function POST(req: NextRequest) {
  try {
    const nextSeason = await processOffseason();

    return NextResponse.json({
      ok: true,
      message: `Offseason processed successfully. Season ${nextSeason} ready to begin.`,
      new_season: nextSeason,
    });
  } catch (error) {
    console.error('[Offseason] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to process offseason',
      },
      { status: 500 }
    );
  }
}
