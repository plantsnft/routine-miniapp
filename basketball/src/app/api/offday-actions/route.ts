import { NextRequest, NextResponse } from "next/server";
import { basketballDb } from "~/lib/basketballDb";
import { isAfterMidnightET } from "~/lib/dateUtils";

/**
 * POST /api/offday-actions
 * Submit TRAIN or PREP action for current offday
 * 
 * Body: { team_id: string, action: 'TRAIN' | 'PREP' }
 * 
 * Validation:
 * - Current day must be OFFDAY
 * - Must be submitted before midnight Eastern Time
 * - One submission per team per day (UNIQUE constraint)
 * - If PREP, sets teams.prep_boost_active = true
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { team_id, action } = body;

    if (!team_id) {
      return NextResponse.json(
        { ok: false, error: "team_id required" },
        { status: 400 }
      );
    }

    if (!action || (action !== "TRAIN" && action !== "PREP")) {
      return NextResponse.json(
        { ok: false, error: "action must be 'TRAIN' or 'PREP'" },
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

    // Validate it's an OFFDAY
    if (state.day_type !== "OFFDAY") {
      return NextResponse.json(
        { ok: false, error: "Offday actions can only be submitted on OFFDAY" },
        { status: 400 }
      );
    }

    // Check if already submitted for this day
    const existing = await basketballDb.fetch("offday_actions", {
      filters: {
        season_number: state.season_number,
        day_number: state.day_number,
        team_id: team_id,
      },
      limit: 1,
    });

    if (existing.length > 0) {
      // Update existing submission
      await basketballDb.update(
        "offday_actions",
        {
          season_number: state.season_number,
          day_number: state.day_number,
          team_id: team_id,
        },
        {
          action: action,
        }
      );
    } else {
      // Create new submission
      await basketballDb.insert("offday_actions", {
        season_number: state.season_number,
        day_number: state.day_number,
        team_id: team_id,
        action: action,
      });
    }

    // If PREP, set prep_boost_active = true on team
    if (action === "PREP") {
      await basketballDb.update(
        "teams",
        { id: team_id },
        { prep_boost_active: true }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Offday action '${action}' submitted successfully`,
    });
  } catch (error) {
    console.error("[Offday Actions] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to submit offday action",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/offday-actions?team_id=xxx&season_number=1&day_number=1
 * Get offday action for a specific team/day
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

    const actions = await basketballDb.fetch("offday_actions", {
      filters: {
        team_id: team_id,
        season_number: seasonNum,
        day_number: dayNum,
      },
      limit: 1,
    });

    return NextResponse.json({
      ok: true,
      action: actions.length > 0 ? actions[0] : null,
    });
  } catch (error) {
    console.error("[Offday Actions] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch offday action",
      },
      { status: 500 }
    );
  }
}
