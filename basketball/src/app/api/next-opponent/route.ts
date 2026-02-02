import { NextRequest, NextResponse } from 'next/server';
import { basketballDb } from '~/lib/basketballDb';
import { generateScheduleForGameNight } from '~/lib/gameSimulation';

/**
 * GET /api/next-opponent?team_id=xxx
 * Get next opponent for a team
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('team_id');

    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: 'team_id required' },
        { status: 400 }
      );
    }

    // Get current season state
    const seasonState = await basketballDb.fetch('season_state', { limit: 1 });
    if (seasonState.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'League not initialized' },
        { status: 400 }
      );
    }

    const state = seasonState[0];

    // Calculate next game day
    const nextGameDay = state.day_type === 'OFFDAY'
      ? state.day_number + 1  // Next day is GAMENIGHT
      : state.day_number + 2; // Skip next OFFDAY, go to next GAMENIGHT

    // Convert to GameNight number
    const nextGameNightNumber = nextGameDay / 2;

    // If in playoffs, we need different logic
    if (state.phase === 'PLAYOFFS') {
      // For playoffs, get top 2 teams and determine opponent
      const allStats = await basketballDb.fetch('team_season_stats', {
        filters: { season_number: state.season_number },
      });

      const teams = await basketballDb.fetch('teams');
      const teamMap = new Map(teams.map((t) => [t.id, t]));

      const teamsWithStats = await Promise.all(
        allStats.map(async (stat) => {
          const team = teamMap.get(stat.team_id);
          return {
            team,
            wins: stat.wins,
            losses: stat.losses,
            winPct: stat.games_played > 0 ? stat.wins / stat.games_played : 0,
          };
        })
      );

      teamsWithStats.sort((a, b) => {
        if (a.wins !== b.wins) return b.wins - a.wins;
        return b.winPct - a.winPct;
      });

      if (teamsWithStats.length >= 2) {
        const [higherSeed, lowerSeed] = teamsWithStats;
        const userTeam = teamsWithStats.find((t) => t.team?.id === teamId);
        
        if (userTeam) {
          const opponent = userTeam.team?.id === higherSeed.team?.id 
            ? lowerSeed.team 
            : higherSeed.team;
          
          if (opponent) {
            return NextResponse.json({
              ok: true,
              opponent: {
                team_id: opponent.id,
                team_name: opponent.name,
                day_number: nextGameDay,
                is_home: userTeam.team?.id === higherSeed.team?.id,
              },
            });
          }
        }
      }
    } else {
      // Regular season: use schedule generator
      const teams = await basketballDb.fetch('teams');
      const sortedTeams = teams.sort((a, b) => a.name.localeCompare(b.name));
      
      const scheduledGames = generateScheduleForGameNight(nextGameNightNumber, sortedTeams);
      
      // Find game involving this team
      const game = scheduledGames.find(
        (g) => g.home_team_id === teamId || g.away_team_id === teamId
      );

      if (game) {
        const opponentId = game.home_team_id === teamId 
          ? game.away_team_id 
          : game.home_team_id;
        
        const opponent = sortedTeams.find((t) => t.id === opponentId);
        
        if (opponent) {
          return NextResponse.json({
            ok: true,
            opponent: {
              team_id: opponent.id,
              team_name: opponent.name,
              day_number: nextGameDay,
              is_home: game.home_team_id === teamId,
            },
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      opponent: null, // No next game found
    });
  } catch (error) {
    console.error('[Next Opponent] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch next opponent',
      },
      { status: 500 }
    );
  }
}
