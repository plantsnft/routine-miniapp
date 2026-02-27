/**
 * GET /api/games/[id]/sunday-high-stakes-signup — Current user's signup for this game
 * POST /api/games/[id]/sunday-high-stakes-signup — Submit or update cast_url (upsert, status=pending)
 * Phase 32: Sunday High Stakes
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '~/lib/auth';
import { pokerDb } from '~/lib/pokerDb';
import { requireGameAccess } from '~/lib/pokerPermissions';
import type { ApiResponse } from '~/lib/types';

export const dynamic = 'force-dynamic';

async function getGame(gameId: string) {
  const games = await pokerDb.fetch<any>('burrfriends_games', {
    filters: { id: gameId },
    select: 'id,is_sunday_high_stakes',
    limit: 1,
  });
  return games[0] ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const { fid } = await requireAuth(req);
    await requireGameAccess(fid, gameId);

    const game = await getGame(gameId);
    if (!game) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Game not found' }, { status: 404 });
    }
    if (!game.is_sunday_high_stakes) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Not a Sunday High Stakes game' }, { status: 400 });
    }

    const signups = await pokerDb.fetch<any>('poker_sunday_high_stakes_signups', {
      filters: { game_id: gameId, fid },
      select: 'id,cast_url,status,approved_at',
      limit: 1,
    });
    const signup = signups[0] ?? null;
    if (!signup) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'No signup found' }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<{ status: string; cast_url: string | null }>>({
      ok: true,
      data: { status: signup.status, cast_url: signup.cast_url ?? null },
    });
  } catch (e: any) {
    if (e.message?.includes('authentication') || e.message?.includes('token')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 401 });
    }
    if (e.message?.includes('not found') || e.message?.includes('Game')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 404 });
    }
    return NextResponse.json<ApiResponse>({ ok: false, error: e?.message || 'Failed to fetch signup' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const { fid } = await requireAuth(req);
    await requireGameAccess(fid, gameId);

    const game = await getGame(gameId);
    if (!game) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Game not found' }, { status: 404 });
    }
    if (!game.is_sunday_high_stakes) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Not a Sunday High Stakes game' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const cast_url = typeof body.cast_url === 'string' ? body.cast_url.trim() : '';
    if (!cast_url) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'cast_url is required' }, { status: 400 });
    }

    await pokerDb.upsert('poker_sunday_high_stakes_signups', {
      game_id: gameId,
      fid,
      cast_url,
      status: 'pending',
    });

    return NextResponse.json<ApiResponse<{ status: string }>>({
      ok: true,
      data: { status: 'pending' },
    });
  } catch (e: any) {
    if (e.message?.includes('authentication') || e.message?.includes('token')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 401 });
    }
    if (e.message?.includes('not found') || e.message?.includes('Game')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 404 });
    }
    return NextResponse.json<ApiResponse>({ ok: false, error: e?.message || 'Failed to submit signup' }, { status: 500 });
  }
}
