/**
 * GET /api/stats?fid=123
 * Get player statistics
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '~/lib/auth';
import { getPlayerStats } from '~/lib/stats';
import type { ApiResponse } from '~/lib/types';

export async function GET(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid: authFid } = await requireAuth(req);
    
    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get('fid');
    
    // Use provided fid or authenticated user's fid
    const fid = fidParam ? parseInt(fidParam, 10) : authFid;
    
    if (!fid || isNaN(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Missing or invalid fid parameter' },
        { status: 400 }
      );
    }

    const stats = await getPlayerStats(fid);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: stats || null,
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    console.error('[API][stats] Error:', error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
