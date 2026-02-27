/**
 * GET /api/games/[id]/sunday-high-stakes-signups — List signups (club owner or global admin)
 * Phase 32: Sunday High Stakes
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '~/lib/auth';
import { pokerDb } from '~/lib/pokerDb';
import { requireClubOwner } from '~/lib/pokerPermissions';
import { isGlobalAdmin } from '~/lib/permissions';
import type { ApiResponse } from '~/lib/types';

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

    const clubId = game.club_id;
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
    }

    const signups = await pokerDb.fetch<any>('poker_sunday_high_stakes_signups', {
      filters: { game_id: gameId },
      select: 'id,game_id,fid,cast_url,status,approved_at,approved_by_fid,inserted_at',
      order: 'inserted_at.desc',
    });

    return NextResponse.json<ApiResponse<typeof signups>>({
      ok: true,
      data: signups,
    });
  } catch (e: any) {
    if (e.message?.includes('authentication') || e.message?.includes('token')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 401 });
    }
    if (e.message?.includes('not the owner') || e.message?.includes('not found')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 403 });
    }
    return NextResponse.json<ApiResponse>({ ok: false, error: e?.message || 'Failed to list signups' }, { status: 500 });
  }
}
