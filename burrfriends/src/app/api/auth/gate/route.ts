/**
 * POST /api/auth/gate
 *
 * App gate for BETR WITH BURR. User can access if:
 * - Neynar score >= 0.6, OR
 * - Staked 50M+ $BETR (on-chain, same source as lobby/BETR Games staking)
 *
 * On any error: fail open (allow access).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '~/lib/auth';
import { getNeynarClient } from '~/lib/neynar';
import { checkUserStakeByFid } from '~/lib/staking';
import {
  BETR_APP_GATE_MIN_STAKE,
  NEYNAR_SCORE_GATE_MIN,
} from '~/lib/constants';

const GATE_DENIED_MESSAGE =
  'A neynar score of 0.60 is required BETR WITH BURR app unless you are staking 50m $BETR';

function parseNeynarScore(user: unknown): number {
  if (!user || typeof user !== 'object') return 0;
  const u = user as Record<string, unknown>;
  const raw = u?.score ?? u?.global_score ?? u?.rating ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body as { token?: string })?.token;

    if (!token) {
      return NextResponse.json(
        { allowed: false, message: GATE_DENIED_MESSAGE },
        { status: 400 }
      );
    }

    const { fid } = await requireAuth(req, token);

    // 1. Neynar score (fail open on error)
    try {
      const neynarClient = getNeynarClient();
      const { users } = await neynarClient.fetchBulkUsers({
        fids: [fid],
      });
      const user = users?.[0];
      const score = parseNeynarScore(user);
      if (score >= NEYNAR_SCORE_GATE_MIN) {
        return NextResponse.json({ allowed: true });
      }
    } catch {
      return NextResponse.json({ allowed: true });
    }

    // 2. On-chain stake (fail open on error)
    try {
      const result = await checkUserStakeByFid(fid, BETR_APP_GATE_MIN_STAKE);
      if (result.meetsRequirement) {
        return NextResponse.json({ allowed: true });
      }
    } catch {
      return NextResponse.json({ allowed: true });
    }

    return NextResponse.json({
      allowed: false,
      message: GATE_DENIED_MESSAGE,
    });
  } catch {
    return NextResponse.json({ allowed: true });
  }
}
