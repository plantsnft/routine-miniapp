/**
 * POST /api/superbowl-squares/claim - Player claims squares based on staking tier
 * 
 * Tier logic (Phase 23.3):
 * - Tier 1 (200M+ staked): 3 squares
 * - Tier 2 (100M+ staked): 2 squares
 * - Tier 3 (50M+ staked): 1 square
 * 
 * Window logic:
 * - Window 1 (first 12h): Tier 1 + Tier 2 can claim
 * - Window 2 (after 12h): All 50M+ can claim
 * - squaresAllowed always based on staking tier (no double-dipping)
 * - If higher-tier staker misses Window 1, falls through to Window 2 with full allocation
 * 
 * Total auto squares: 90 (10 reserved for admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { checkUserStakeByFid } from "~/lib/staking";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

interface TierInfo {
  tier: 'tier1' | 'tier2' | 'tier3';
  minStake: number;
  squaresAllowed: number;
  opensAt: Date | null;
  closesAt: Date | null;
}

function getUserTier(stakedAmount: number, game: any): TierInfo | null {
  const staked = parseFloat(stakedAmount.toString());
  const now = new Date();

  // Step 1: Determine max squares based on staking amount (always highest tier match)
  let maxSquares: number;
  let tierName: 'tier1' | 'tier2' | 'tier3';
  let minStake: number;

  if (staked >= game.tier1_min_stake) {
    maxSquares = game.tier1_squares_per_user;
    tierName = 'tier1';
    minStake = game.tier1_min_stake;
  } else if (staked >= game.tier2_min_stake) {
    maxSquares = game.tier2_squares_per_user;
    tierName = 'tier2';
    minStake = game.tier2_min_stake;
  } else if (staked >= game.tier3_min_stake) {
    maxSquares = game.tier3_squares_per_user;
    tierName = 'tier3';
    minStake = game.tier3_min_stake;
  } else {
    return null; // Below minimum staking
  }

  // Step 2: Find any open window the user qualifies for (fall through closed windows)
  const windows = [
    { min: game.tier1_min_stake, opens: game.tier1_opens_at, closes: game.tier1_closes_at },
    { min: game.tier2_min_stake, opens: game.tier2_opens_at, closes: game.tier2_closes_at },
    { min: game.tier3_min_stake, opens: game.tier3_opens_at, closes: null },
  ];

  for (const w of windows) {
    if (staked < w.min) continue; // Doesn't meet this window's staking requirement
    const opensAt = w.opens ? new Date(w.opens) : null;
    const closesAt = w.closes ? new Date(w.closes) : null;
    if (opensAt && now < opensAt) continue; // Not yet open
    if (closesAt && now > closesAt) continue; // Window closed — fall through to next
    // This window is open and user qualifies
    return { tier: tierName, minStake, squaresAllowed: maxSquares, opensAt, closesAt };
  }

  return null; // No open window found
}

function formatBetr(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(0)}M`;
  }
  return amount.toLocaleString();
}

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const { gameId, squareIndices } = body;

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "gameId required" }, { status: 400 });
    }

    if (!squareIndices || !Array.isArray(squareIndices) || squareIndices.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "squareIndices array required" }, { status: 400 });
    }

    // Validate square indices
    for (const idx of squareIndices) {
      if (typeof idx !== 'number' || idx < 0 || idx >= 100) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Invalid square index: ${idx}` }, { status: 400 });
      }
    }

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "claiming") {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Game is not in claiming phase (current: ${game.status})` 
      }, { status: 400 });
    }

    // Check user's staking amount
    const stakingResult = await checkUserStakeByFid(fid, 1); // Check any stake
    const stakedAmount = parseFloat(stakingResult.stakedAmount);

    // Determine user's tier
    const tierInfo = getUserTier(stakedAmount, game);

    if (!tierInfo) {
      // Check if user qualifies for a tier but window hasn't opened yet
      const staked = parseFloat(stakedAmount.toString());
      if (staked >= game.tier3_min_stake && game.tier3_opens_at) {
        const tier3Opens = new Date(game.tier3_opens_at);
        if (new Date() < tier3Opens) {
          let squares = 1;
          if (staked >= game.tier1_min_stake) squares = game.tier1_squares_per_user;
          else if (staked >= game.tier2_min_stake) squares = game.tier2_squares_per_user;
          return NextResponse.json<ApiResponse>({ 
            ok: false, 
            error: `You will be able to claim ${squares} square${squares > 1 ? 's' : ''} at 10 AM EST on Feb 7` 
          }, { status: 400 });
        }
      }
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Insufficient stake. Minimum ${formatBetr(game.tier3_min_stake)} BETR required. You have ${formatBetr(stakedAmount)} BETR staked.` 
      }, { status: 403 });
    }

    // Check if user's tier window is open
    const now = new Date();

    if (tierInfo.opensAt && now < tierInfo.opensAt) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `${tierInfo.tier.toUpperCase()} window not yet open. Opens at ${tierInfo.opensAt.toISOString()}` 
      }, { status: 400 });
    }

    if (tierInfo.closesAt && now > tierInfo.closesAt) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `${tierInfo.tier.toUpperCase()} window has closed` 
      }, { status: 400 });
    }

    // Fetch existing claims
    const existingClaims = await pokerDb.fetch<any>("superbowl_squares_claims", {
      filters: { game_id: gameId },
      select: "id,fid,square_index,claim_type",
      limit: 100,
    });

    // Check how many squares user already has
    const userClaims = (existingClaims || []).filter((c: any) => c.fid === fid);
    const userClaimCount = userClaims.length;

    if (userClaimCount >= tierInfo.squaresAllowed) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `You already have ${userClaimCount} square(s). ${tierInfo.tier.toUpperCase()} allows maximum ${tierInfo.squaresAllowed}.` 
      }, { status: 400 });
    }

    const remainingAllowed = tierInfo.squaresAllowed - userClaimCount;
    if (squareIndices.length > remainingAllowed) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `You can only claim ${remainingAllowed} more square(s). Tried to claim ${squareIndices.length}.` 
      }, { status: 400 });
    }

    // Check auto squares limit
    const autoClaims = (existingClaims || []).filter((c: any) => c.claim_type !== 'admin');
    if (autoClaims.length + squareIndices.length > game.auto_squares_limit) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Only ${game.auto_squares_limit - autoClaims.length} auto squares remaining` 
      }, { status: 400 });
    }

    // Check if requested squares are available
    const takenSquares = new Set((existingClaims || []).map((c: any) => c.square_index));
    const unavailable = squareIndices.filter((idx: number) => takenSquares.has(idx));

    if (unavailable.length > 0) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Squares already taken: ${unavailable.join(', ')}` 
      }, { status: 400 });
    }

    // Create claims
    const newClaims = squareIndices.map((idx: number) => ({
      game_id: gameId,
      fid,
      square_index: idx,
      claim_type: tierInfo.tier,
      display_name: null, // Profile data fetched separately when displaying
      pfp_url: null, // Profile data fetched separately when displaying
      claimed_at: new Date().toISOString(),
    }));

    const insertedClaims = await pokerDb.insert("superbowl_squares_claims", newClaims);

    // Hydrate user profile (same pattern as Props submit)
    try {
      const client = getNeynarClient();
      const { users } = await client.fetchBulkUsers({ fids: [fid] });
      const u = users?.[0] as { username?: string; display_name?: string; pfp_url?: string; pfp?: { url?: string } } | undefined;
      if (u) {
        for (const idx of squareIndices) {
          await pokerDb.update(
            "superbowl_squares_claims",
            { game_id: gameId, fid, square_index: idx },
            {
              display_name: u.display_name ?? null,
              pfp_url: u.pfp_url ?? u.pfp?.url ?? null,
            }
          );
        }
      }
    } catch (profileErr) {
      console.error("[superbowl-squares/claim] Failed to hydrate profile:", profileErr);
      // Non-fatal - claims already saved
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: `Successfully claimed ${squareIndices.length} square(s)`,
        tier: tierInfo.tier,
        squaresAllowed: tierInfo.squaresAllowed,
        squaresClaimed: userClaimCount + squareIndices.length,
        claims: insertedClaims,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-squares/claim POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to claim squares" }, { status: 500 });
  }
}
