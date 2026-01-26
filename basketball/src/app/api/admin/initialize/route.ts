import { NextRequest, NextResponse } from "next/server";
import { basketballDb } from "~/lib/basketballDb";
import { fetchFidByUsername } from "~/lib/neynar";
import {
  FARCASTER_USERNAMES,
  EMAIL_USER,
  TEAM_NAMES,
  UVA_PLAYER_NAMES_1980_1986,
} from "~/lib/constants";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
const TIERS = ["good", "great", "elite"] as const;
const AFFINITIES = ["StrongVsZone", "StrongVsMan"] as const;

/**
 * Phase 2: League Initialization
 * 
 * Following SoT requirements:
 * - Fetch FIDs for Farcaster usernames
 * - Create 4 profiles (3 Farcaster + 1 email)
 * - Create 4 teams with names: Houston, Atlanta, Vegas, NYC
 * - Create 20 players: 1 Elite, 1 Great, 3 Good per team
 * - Positions: PG/SG/SF/PF/C (one of each per team)
 * - Randomly assign UVA player names (no duplicates)
 * - Randomly assign affinities
 * - Create season_state (season 1, day 1, OFFDAY, REGULAR)
 * - Create initial stats records
 */
export async function POST(req: NextRequest) {
  try {
    // Check if league already initialized
    const existingState = await basketballDb.fetch("season_state", { limit: 1 });
    if (existingState.length > 0) {
      const state = existingState[0];
      if (state.season_number > 0 || state.day_number > 1) {
        return NextResponse.json(
          { ok: false, error: "League already initialized" },
          { status: 400 }
        );
      }
    }

    // Step 1: Fetch FIDs for Farcaster usernames
    const fids: Record<string, number> = {};
    const failedUsernames: string[] = [];

    for (const username of FARCASTER_USERNAMES) {
      const fid = await fetchFidByUsername(username);
      if (fid === null) {
        failedUsernames.push(username);
      } else {
        fids[username] = fid;
      }
    }

    if (failedUsernames.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch FIDs for usernames: ${failedUsernames.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Step 2: Create 4 profiles (3 Farcaster + 1 email)
    const profiles = [];

    // Create Farcaster profiles
    for (const username of FARCASTER_USERNAMES) {
      // Check if profile already exists
      const existing = await basketballDb.fetch("profiles", {
        filters: { farcaster_fid: fids[username] },
        limit: 1,
      });

      if (existing.length === 0) {
        const profile = await basketballDb.insert("profiles", {
          auth_type: "farcaster",
          farcaster_fid: fids[username],
          email: null,
          is_admin: true, // MVP: all users are admin
        });
        profiles.push(profile[0]);
      } else {
        profiles.push(existing[0]);
      }
    }

    // Create email profile
    const existingEmail = await basketballDb.fetch("profiles", {
      filters: { email: EMAIL_USER },
      limit: 1,
    });

    if (existingEmail.length === 0) {
      const emailProfile = await basketballDb.insert("profiles", {
        auth_type: "email",
        email: EMAIL_USER,
        farcaster_fid: null,
        is_admin: true, // MVP: all users are admin
      });
      profiles.push(emailProfile[0]);
    } else {
      profiles.push(existingEmail[0]);
    }

    if (profiles.length !== 4) {
      return NextResponse.json(
        { ok: false, error: `Expected 4 profiles, got ${profiles.length}` },
        { status: 500 }
      );
    }

    // Step 3: Create 4 teams with names: Houston, Atlanta, Vegas, NYC
    // Assign teams to profiles in order: Houston → first, Atlanta → second, Vegas → third, NYC → fourth
    const teams = [];
    for (let i = 0; i < 4; i++) {
      const team = await basketballDb.insert("teams", {
        name: TEAM_NAMES[i],
        owner_profile_id: profiles[i].id,
        prep_boost_active: false,
      });
      teams.push(team[0]);
    }

    // Step 4: Create 20 players
    // Each team: 1 Elite, 1 Great, 3 Good
    // Positions: PG/SG/SF/PF/C (one of each per team)
    // Randomly assign UVA player names (no duplicates)
    // Randomly assign affinities

    // Shuffle UVA player names to randomly assign
    const availableNames = [...UVA_PLAYER_NAMES_1980_1986];
    for (let i = availableNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableNames[i], availableNames[j]] = [availableNames[j], availableNames[i]];
    }

    // Tier distribution per team: [Elite, Great, Good, Good, Good]
    const tierDistribution = ["elite", "great", "good", "good", "good"] as const;

    // Rating ranges by tier (MVP decision: start players at reasonable ratings)
    const getInitialRating = (tier: typeof TIERS[number]): number => {
      switch (tier) {
        case "elite":
          return Math.floor(Math.random() * 5) + 90; // 90-94
        case "great":
          return Math.floor(Math.random() * 5) + 80; // 80-84
        case "good":
          return Math.floor(Math.random() * 5) + 70; // 70-74
      }
    };

    // Salary by tier (from SoT)
    const getSalary = (tier: typeof TIERS[number]): number => {
      switch (tier) {
        case "elite":
          return 20; // $20M
        case "great":
          return 15; // $15M
        case "good":
          return 8; // $8M
      }
    };

    // Age: Start players at reasonable ages (MVP decision: 22-26)
    const getInitialAge = (): number => {
      return Math.floor(Math.random() * 5) + 22; // 22-26
    };

    const players = [];
    let nameIndex = 0;

    for (let teamIndex = 0; teamIndex < 4; teamIndex++) {
      const team = teams[teamIndex];
      
      // Shuffle positions for this team
      const teamPositions = [...POSITIONS];
      for (let i = teamPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [teamPositions[i], teamPositions[j]] = [teamPositions[j], teamPositions[i]];
      }

      for (let playerIndex = 0; playerIndex < 5; playerIndex++) {
        const tier = tierDistribution[playerIndex];
        const position = teamPositions[playerIndex];
        const name = availableNames[nameIndex++];
        const affinity = AFFINITIES[Math.floor(Math.random() * AFFINITIES.length)];

        const player = await basketballDb.insert("players", {
          team_id: team.id,
          name: name,
          position: position,
          tier: tier,
          rating: getInitialRating(tier),
          age: getInitialAge(),
          affinity: affinity,
          salary_m: getSalary(tier),
          contract_years_remaining: 3, // 3-year contracts (from SoT)
        });

        players.push(player[0]);
      }
    }

    // Step 5: Create/update season_state (season 1, day 1, OFFDAY, REGULAR)
    const existingStateRow = await basketballDb.fetch("season_state", { limit: 1 });
    if (existingStateRow.length > 0) {
      await basketballDb.update(
        "season_state",
        { id: 1 },
        {
          season_number: 1,
          day_number: 1,
          phase: "REGULAR",
          day_type: "OFFDAY",
        }
      );
    } else {
      await basketballDb.insert("season_state", {
        id: 1,
        season_number: 1,
        day_number: 1,
        phase: "REGULAR",
        day_type: "OFFDAY",
      });
    }

    // Step 6: Create initial team_season_stats for season 1
    for (const team of teams) {
      const existing = await basketballDb.fetch("team_season_stats", {
        filters: { season_number: 1, team_id: team.id },
        limit: 1,
      });

      if (existing.length === 0) {
        await basketballDb.insert("team_season_stats", {
          season_number: 1,
          team_id: team.id,
          wins: 0,
          losses: 0,
          games_played: 0,
          points_for: 0,
          points_against: 0,
          streak_type: "NONE",
          streak_count: 0,
        });
      }
    }

    // Step 7: Create initial player_season_stats for season 1
    for (const player of players) {
      const existing = await basketballDb.fetch("player_season_stats", {
        filters: { season_number: 1, player_id: player.id },
        limit: 1,
      });

      if (existing.length === 0) {
        await basketballDb.insert("player_season_stats", {
          season_number: 1,
          player_id: player.id,
          team_id: player.team_id,
          games_played: 0,
          points: 0,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: "League initialized successfully",
      data: {
        profilesCreated: profiles.length,
        teamsCreated: teams.length,
        playersCreated: players.length,
      },
    });
  } catch (error) {
    console.error("[Initialize] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Initialization failed",
      },
      { status: 500 }
    );
  }
}
