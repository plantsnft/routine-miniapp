/**
 * POST /api/games/[id]/sunday-high-stakes-signups/[fid]/reject — Reject signup (club owner or global admin)
 * Phase 32: Sunday High Stakes
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '~/lib/auth';
import { pokerDb } from '~/lib/pokerDb';
import { requireClubOwner } from '~/lib/pokerPermissions';
import { isGlobalAdmin } from '~/lib/permissions';
import type { ApiResponse } from '~/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  try {
    const { id: gameId, fid: targetFidParam } = await params;
    const targetFid = parseInt(targetFidParam, 10);
    if (!Number.isFinite(targetFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Invalid fid' }, { status: 400 });
    }

    const { fid: callerFid } = await requireAuth(req);

    const games = await pokerDb.fetch<any>('burrfriends_games', {
      filters: { id: gameId },
      select: 'id,club_id,is_sunday_high_stakes',
      limit: 1,
    });
    const game = games[0] ?? null;
    if (!game) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Game not found' }, { status: 404 });
    }
    if (!game.is_sunday_high_stakes) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Not a Sunday High Stakes game' }, { status: 400 });
    }

    if (!isGlobalAdmin(callerFid)) {
      await requireClubOwner(callerFid, game.club_id);
    }

    const signups = await pokerDb.fetch<any>('poker_sunday_high_stakes_signups', {
      filters: { game_id: gameId, fid: targetFid },
      limit: 1,
    });
    const signup = signups[0] ?? null;
    if (!signup) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Signup not found' }, { status: 404 });
    }

    await pokerDb.update(
      'poker_sunday_high_stakes_signups',
      { game_id: gameId, fid: targetFid },
      { status: 'rejected' }
    );

    return NextResponse.json<ApiResponse<{ status: string }>>({
      ok: true,
      data: { status: 'rejected' },
    });
  } catch (e: any) {
    if (e.message?.includes('authentication') || e.message?.includes('token')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 401 });
    }
    if (e.message?.includes('not the owner') || e.message?.includes('not found')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 403 });
    }
    return NextResponse.json<ApiResponse>({ ok: false, error: e?.message || 'Failed to reject' }, { status: 500 });
  }
}
