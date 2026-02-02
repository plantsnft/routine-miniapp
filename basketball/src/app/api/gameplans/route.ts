import { NextRequest, NextResponse } from "next/server";
import { basketballDb } from "~/lib/basketballDb";
import { isAfterMidnightET } from "~/lib/dateUtils";

/**
 * POST /api/gameplans
 * Submit gameplan (Offense/Defense/Mentality) for next game
 * 
 * Body: {
 *   team_id: string,
 *   offense: 'Drive' | 'Shoot',
 *   defense: 'Zone' | 'Man',
 *   mentality: 'Aggressive' | 'Conservative' | 'Neutral'
 * }
 * 
 * Validation:
 * - Must be submitted before midnight Eastern Time
 * - One submission per team per day (UNIQUE constraint)
 * - Gameplan is for the NEXT game (next game night)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { team_id, offense, defense, mentality } = body;

    if (!team_id) {
      return NextResponse.json(
        { ok: false, error: "team_id required" },
        { status: 400 }
      );
    }

    if (!offense || (offense !== "Drive" && offense !== "Shoot")) {
      return NextResponse.json(
        { ok: false, error: "offense must be 'Drive' or 'Shoot'" },
        { status: 400 }
      );
    }

    if (!defense || (defense !== "Zone" && defense !== "Man")) {
      return NextResponse.json(
        { ok: false, error: "defense must be 'Zone' or 'Man'" },
        { status: 400 }
      );
    }

    if (
      !mentality ||
      (mentality !== "Aggressive" && mentality !== "Conservative" && mentality !== "Neutral")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "mentality must be 'Aggressive', 'Conservative', or 'Neutral'",
        },
        { status: 400 }
      );
    }

    // Validate cutoff time: must be submitted before midnight Eastern Time
    if (isAfterMidnightET()) {
      return NextResponse.json(
        { ok: false, error: "Submissions must be made before midnight Eastern Time" },
        { status: 400 }
      );
    }

    // Get current season state
    const seasonState = await basketballDb.fetch("season_state", { limit: 1 });
    if (seasonState.length === 0) {
      return NextResponse.json(
        { ok: false, error: "League not initialized" },
        { status: 400 }
      );
    }

    const state = seasonState[0];

    // Gameplan is for the NEXT game night
    // Days alternate: OFFDAY, GAMENIGHT, OFFDAY, GAMENIGHT, ...
    // If current day is OFFDAY (odd day), next game is day_number + 1 (GAMENIGHT)
    // If current day is GAMENIGHT (even day), next game is day_number + 1 (OFFDAY), then day_number + 2 (GAMENIGHT)
    const nextGameDay = state.day_type === "OFFDAY" 
      ? state.day_number + 1  // Next day is GAMENIGHT
      : state.day_number + 2; // Skip next OFFDAY, go to next GAMENIGHT

    // Check if already submitted for this day
    const existing = await basketballDb.fetch("gameplans", {
      filters: {
        season_number: state.season_number,
        day_number: nextGameDay,
        team_id: team_id,
      },
      limit: 1,
    });

    if (existing.length > 0) {
      // Update existing submission
      await basketballDb.update(
        "gameplans",
        {
          season_number: state.season_number,
          day_number: nextGameDay,
          team_id: team_id,
        },
        {
          offense: offense,
          defense: defense,
          mentality: mentality,
        }
      );
    } else {
      // Create new submission
      await basketballDb.insert("gameplans", {
        season_number: state.season_number,
        day_number: nextGameDay,
        team_id: team_id,
        offense: offense,
        defense: defense,
        mentality: mentality,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Gameplan submitted successfully",
    });
  } catch (error) {
    console.error("[Gameplans] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to submit gameplan",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gameplans?team_id=xxx&season_number=1&day_number=1
 * Get gameplan for a specific team/day
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const team_id = searchParams.get("team_id");
    const season_number = searchParams.get("season_number");
    const day_number = searchParams.get("day_number");

    if (!team_id || !season_number || !day_number) {
      return NextResponse.json(
        { ok: false, error: "team_id, season_number, and day_number required" },
        { status: 400 }
      );
    }

    // Validate season_number and day_number are positive integers
    const seasonNum = parseInt(season_number, 10);
    const dayNum = parseInt(day_number, 10);
    if (isNaN(seasonNum) || seasonNum < 1 || !Number.isInteger(seasonNum)) {
      return NextResponse.json(
        { ok: false, error: "Invalid season_number. Must be a positive integer." },
        { status: 400 }
      );
    }
    if (isNaN(dayNum) || dayNum < 1 || !Number.isInteger(dayNum)) {
      return NextResponse.json(
        { ok: false, error: "Invalid day_number. Must be a positive integer." },
        { status: 400 }
      );
    }

    const gameplans = await basketballDb.fetch("gameplans", {
      filters: {
        team_id: team_id,
        season_number: seasonNum,
        day_number: dayNum,
      },
      limit: 1,
    });

    return NextResponse.json({
      ok: true,
      gameplan: gameplans.length > 0 ? gameplans[0] : null,
    });
  } catch (error) {
    console.error("[Gameplans] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch gameplan",
      },
      { status: 500 }
    );
  }
}
