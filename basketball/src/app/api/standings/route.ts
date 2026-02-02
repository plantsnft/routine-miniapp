import { NextRequest, NextResponse } from 'next/server';
import { basketballDb } from '~/lib/basketballDb';

/**
 * GET /api/standings?season_number=1
 * Get standings for a season (all teams with stats)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seasonNumber = parseInt(searchParams.get('season_number') || '1', 10);

    // Get all teams
    const teams = await basketballDb.fetch('teams');

    // Get stats for all teams for this season
    const allStats = await basketballDb.fetch('team_season_stats', {
      filters: {
        season_number: seasonNumber,
      },
    });

    // Validate season_number
    if (seasonNumber < 1 || !Number.isInteger(seasonNumber)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid season_number. Must be a positive integer.' },
        { status: 400 }
      );
    }

    // Create stats lookup map
    const statsMap = new Map(allStats.map(s => [s.team_id, s]));

    // Combine teams with their stats (optimization: remove unnecessary Promise.all)
    const standings = teams.map((team) => {
      const stat = statsMap.get(team.id);
      
      if (!stat) {
        return {
          team_id: team.id,
          team_name: team.name,
          wins: 0,
          losses: 0,
          games_played: 0,
          points_for: 0,
          points_against: 0,
          win_percentage: 0,
          ppg: 0,
          opp_ppg: 0,
        };
      }

      const gamesPlayed = stat.games_played || 0;
      const winPct = gamesPlayed > 0 ? stat.wins / gamesPlayed : 0;
      const ppg = gamesPlayed > 0 ? stat.points_for / gamesPlayed : 0;
      const oppPpg = gamesPlayed > 0 ? stat.points_against / gamesPlayed : 0;

      return {
        team_id: team.id,
        team_name: team.name,
        wins: stat.wins,
        losses: stat.losses,
        games_played: gamesPlayed,
        points_for: stat.points_for,
        points_against: stat.points_against,
        win_percentage: winPct,
        ppg: ppg,
        opp_ppg: oppPpg,
      };
    });

    // Sort by wins (desc), then win percentage (desc)
    standings.sort((a, b) => {
      if (a.wins !== b.wins) {
        return b.wins - a.wins; // Descending
      }
      return b.win_percentage - a.win_percentage; // Descending
    });

    return NextResponse.json({
      ok: true,
      standings,
      season_number: seasonNumber,
    });
  } catch (error) {
    console.error('[Standings] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch standings',
      },
      { status: 500 }
    );
  }
}
