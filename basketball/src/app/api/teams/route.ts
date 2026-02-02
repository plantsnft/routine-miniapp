import { NextRequest, NextResponse } from "next/server";
import { basketballDb } from "~/lib/basketballDb";

/**
 * GET /api/teams?profile_id=xxx
 * Get team for a specific profile
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const profile_id = searchParams.get("profile_id");

    if (!profile_id) {
      return NextResponse.json(
        { ok: false, error: "profile_id required" },
        { status: 400 }
      );
    }

    const teams = await basketballDb.fetch("teams", {
      filters: { owner_profile_id: profile_id },
      limit: 1,
    });

    if (teams.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Team not found for this profile" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      team: teams[0],
    });
  } catch (error) {
    console.error("[Teams] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch team",
      },
      { status: 500 }
    );
  }
}
