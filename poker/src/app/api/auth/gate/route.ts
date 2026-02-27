/**
 * POST /api/auth/gate
 *
 * App gate check for BETR WITH BURR. User can access the app if:
 * - Neynar score >= 0.6, OR
 * - Staked 50M+ $BETR (via Betrmint, same source as stake_threshold games)
 *
 * On any Neynar or Betrmint error: fail open (allow access).
 * FID comes only from verified JWT via requireAuth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '~/lib/auth';
import { getNeynarClient } from '~/lib/neynar';
import { checkBetrmintStake } from '~/lib/betrmint';
import { pokerDb } from '~/lib/pokerDb';
import {
  BETR_APP_GATE_MIN_STAKE,
  NEYNAR_SCORE_GATE_MIN,
} from '~/lib/constants';

const GATE_DENIED_MESSAGE =
  'A neynar score of 0.60 is required BETR WITH BURR app unless you are staking 50m $BETR';

/**
 * Derive pool ID from an existing stake_threshold game with min amount >= 50M.
 * Same source of truth as game-level stake gating.
 */
async function getAppGatePoolId(): Promise<string | null> {
  try {
    const games = await pokerDb.fetch<any>('games', {
      filters: { gating_type: 'stake_threshold' },
      limit: 50,
    });
    const qualifying = games.filter(
      (g: any) =>
        g.staking_pool_id &&
        Number(g.staking_min_amount) >= BETR_APP_GATE_MIN_STAKE
    );
    return qualifying[0]?.staking_pool_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse Neynar score from user object (multiple possible field names).
 */
function parseNeynarScore(user: any): number {
  if (!user) return 0;
  const raw =
    user?.score ?? user?.global_score ?? user?.rating ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;

    if (!token) {
      return NextResponse.json(
        { allowed: false, message: GATE_DENIED_MESSAGE },
        { status: 400 }
      );
    }

    const { fid } = await requireAuth(req, token);

    // 1. Check Neynar score (fail open on error)
    try {
      const neynarClient = getNeynarClient();
      const { users } = await neynarClient.fetchBulkUsers({ fids: [fid] });
      const user = users?.[0];
      const score = parseNeynarScore(user);
      if (score >= NEYNAR_SCORE_GATE_MIN) {
        return NextResponse.json({ allowed: true });
      }
    } catch {
      // Fail open: allow access when Neynar fails
      return NextResponse.json({ allowed: true });
    }

    // 2. Check Betrmint stake (fail open on error)
    const poolId = await getAppGatePoolId();
    if (poolId) {
      try {
        const hasStake = await checkBetrmintStake({
          fid,
          poolId,
          minAmount: BETR_APP_GATE_MIN_STAKE,
        });
        if (hasStake) {
          return NextResponse.json({ allowed: true });
        }
      } catch {
        // Fail open: allow access when Betrmint fails
        return NextResponse.json({ allowed: true });
      }
    }

    return NextResponse.json({
      allowed: false,
      message: GATE_DENIED_MESSAGE,
    });
  } catch (_error) {
    // Auth failure or other error: fail open
    return NextResponse.json({ allowed: true });
  }
}
