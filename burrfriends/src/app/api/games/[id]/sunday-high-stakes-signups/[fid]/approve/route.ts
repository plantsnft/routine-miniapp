/**
 * POST /api/games/[id]/sunday-high-stakes-signups/[fid]/approve — Approve signup (club owner or global admin), then send notification
 * Phase 32: Sunday High Stakes
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '~/lib/auth';
import { pokerDb } from '~/lib/pokerDb';
import { requireClubOwner } from '~/lib/pokerPermissions';
import { isGlobalAdmin } from '~/lib/permissions';
import { APP_URL } from '~/lib/constants';
import { sendBulkNotifications } from '~/lib/notifications';
import { safeLog } from '~/lib/redaction';
import type { ApiResponse } from '~/lib/types';

export const dynamic = 'force-dynamic';

const MAX_NOTIFICATION_ID_LENGTH = 128;

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
      select: 'id,club_id,name,is_sunday_high_stakes',
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
    if (signup.status === 'approved') {
      return NextResponse.json<ApiResponse>({ ok: true, data: { status: 'approved' } });
    }

    await pokerDb.update(
      'poker_sunday_high_stakes_signups',
      { game_id: gameId, fid: targetFid },
      { status: 'approved', approved_at: new Date().toISOString(), approved_by_fid: callerFid }
    );

    const gameName = game.name || 'Game';
    const body = `A spot has been saved for you in ${gameName}. Please click here to join the game.`;
    const targetUrl = new URL(`/games/${gameId}`, APP_URL).href;
    const notificationId = `sunday_high_stakes_approved:${gameId}:${targetFid}`.slice(0, MAX_NOTIFICATION_ID_LENGTH);

    try {
      const results = await sendBulkNotifications(
        [targetFid],
        { title: 'Spot saved', body, targetUrl },
        notificationId
      );
      safeLog('info', '[sunday-high-stakes] Approval notification sent', {
        gameId,
        targetFid,
        success: results[0]?.success,
      });
    } catch (notifErr: any) {
      safeLog('warn', '[sunday-high-stakes] Failed to send approval notification', {
        gameId,
        targetFid,
        error: notifErr?.message,
      });
    }

    return NextResponse.json<ApiResponse<{ status: string }>>({
      ok: true,
      data: { status: 'approved' },
    });
  } catch (e: any) {
    if (e.message?.includes('authentication') || e.message?.includes('token')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 401 });
    }
    if (e.message?.includes('not the owner') || e.message?.includes('not found')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: e.message }, { status: 403 });
    }
    return NextResponse.json<ApiResponse>({ ok: false, error: e?.message || 'Failed to approve' }, { status: 500 });
  }
}
