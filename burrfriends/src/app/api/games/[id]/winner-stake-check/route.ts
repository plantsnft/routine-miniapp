/**
 * GET /api/games/[id]/winner-stake-check?fids=123,456
 * Returns for each fid: { fid, stakedAmount, isBB } using 50M BETR threshold (Betr Believer).
 * Club owner or global admin only. Phase 32: used when double_payout_if_bb to confirm BB before settle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '~/lib/auth';
import { pokerDb } from '~/lib/pokerDb';
import { requireClubOwner } from '~/lib/pokerPermissions';
import { isGlobalAdmin } from '~/lib/permissions';
import { checkUserStakeByFid } from '~/lib/staking';
import type { ApiResponse } from '~/lib/types';

const BB_THRESHOLD = 50_000_000; // 50M BETR

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const { fid } = await requireAuth(req);

    const games = await pokerDb.fetch<any>('burrfriends_games', {
      filters: { id: gameId },
      select: 'id,club_id,double_payout_if_bb',
      limit: 1,
    });
    const game = games[0] ?? null;
    if (!game) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Game not found' }, { status: 404 });
    }

    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, game.club_id);
    }

    const { searchParams } = new URL(req.url);
    const fidsParam = searchParams.get('fids');
    if (!fidsParam) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'fids query required (comma-separated)' }, { status: 400 });
    }
    const fids = fidsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
    if (fids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'No valid fids' }, { status: 400 });
    }

    const results = await Promise.all(
      fids.map(async (fidNum) => {
        const { stakedAmount, meetsRequirement } = await checkUserStakeByFid(fidNum, BB_THRESHOLD);
        return { fid: fidNum, stakedAmount, isBB: meetsRequirement };
      })
    );

    return NextResponse.json<ApiResponse<typeof results>>({ ok: true, data: results });
  } catch (e: any) {
    if (e.message?.includes('authentication') || e.message?.includes('token')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 401 });
    }
    if (e.message?.includes('not the owner') || e.message?.includes('not found')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 403 });
    }
    return NextResponse.json<ApiResponse>({ ok: false, error: e?.message || 'Failed to check stakes' }, { status: 500 });
  }
}
