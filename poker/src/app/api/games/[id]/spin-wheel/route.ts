import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto'; // CRITICAL: Use crypto.randomInt() for secure random selection
import { requireAuth } from '~/lib/auth';
import { pokerDb } from '~/lib/pokerDb';
import { getClubForGame, requireClubOwner } from '~/lib/pokerPermissions';
import { isGlobalAdmin } from '~/lib/permissions';
import type { ApiResponse, Game } from '~/lib/types';

/**
 * POST /api/games/[id]/spin-wheel
 * Spin the giveaway wheel and select a random winner (club owner or global admin only)
 * 
 * CRITICAL: Uses crypto.randomInt() for cryptographically secure random selection
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const { fid } = await requireAuth(req);
    
    // Verify admin/club owner
    const clubId = await getClubForGame(gameId);
    if (!clubId) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Game not found' },
        { status: 404 }
      );
    }
    
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
    }
    
    // Fetch game
    const games = await pokerDb.fetch<Game>('games', {
      filters: { id: gameId },
      limit: 1,
    });
    
    if (games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Game not found' },
        { status: 404 }
      );
    }
    
    const game = games[0];
    
    if (game.game_type !== 'giveaway_wheel') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Not a giveaway wheel game' },
        { status: 400 }
      );
    }
    
    if (game.wheel_winner_fid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Wheel already spun' },
        { status: 400 }
      );
    }
    
    // Fetch participants (status='joined')
    const participants = await pokerDb.fetch('participants', {
      filters: { game_id: gameId, status: 'joined' },
      select: 'fid',
    });
    
    // Filter out removed participants
    const removedFids = game.wheel_removed_participants || [];
    const eligibleParticipants = participants.filter((p: any) => 
      !removedFids.includes(p.fid)
    );
    
    if (eligibleParticipants.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'No eligible participants' },
        { status: 400 }
      );
    }
    
    // Select winner based on segment type
    let winnerFid: number;
    
    if (game.wheel_segment_type === 'weighted') {
      // Weighted selection
      const weights = game.wheel_participant_weights || {};
      const weightedList: number[] = [];
      
      eligibleParticipants.forEach((p: any) => {
        const weight = weights[p.fid] || 1;
        for (let i = 0; i < weight; i++) {
          weightedList.push(p.fid);
        }
      });
      
      // CRITICAL: Use crypto.randomInt() for secure random selection
      const randomIndex = randomInt(0, weightedList.length);
      winnerFid = weightedList[randomIndex];
    } else {
      // Equal probability
      // CRITICAL: Use crypto.randomInt() for secure random selection
      const randomIndex = randomInt(0, eligibleParticipants.length);
      winnerFid = eligibleParticipants[randomIndex].fid;
    }
    
    // Update game with winner
    await pokerDb.update('games', { id: gameId }, {
      wheel_winner_fid: winnerFid,
      wheel_spun_at: new Date().toISOString(),
    });
    
    return NextResponse.json<ApiResponse<{ winnerFid: number }>>({
      ok: true,
      data: { winnerFid },
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
    if (error.message?.includes('owner') || error.message?.includes('member')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error('[API][spin-wheel] Error:', error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to spin wheel' },
      { status: 500 }
    );
  }
}
