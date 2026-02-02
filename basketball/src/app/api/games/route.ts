import { NextRequest, NextResponse } from 'next/server';
import { basketballDb } from '~/lib/basketballDb';

/**
 * GET /api/games?team_id=xxx&season_number=1
 * Get games for a team (or all games if no team_id)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('team_id');
    const seasonNumber = parseInt(searchParams.get('season_number') || '1', 10);

    // Validate season_number
    if (seasonNumber < 1 || !Number.isInteger(seasonNumber)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid season_number. Must be a positive integer.' },
        { status: 400 }
      );
    }

    // Get all games for this season
    let games = await basketballDb.fetch('games', {
      filters: {
        season_number: seasonNumber,
        status: 'FINAL',
      },
    });

    // Filter by team if specified
    if (teamId) {
      games = games.filter(
        (game) => game.home_team_id === teamId || game.away_team_id === teamId
      );
    }

    // Get all teams for name lookup
    const teams = await basketballDb.fetch('teams');
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));

    // Format games with team names
    const formattedGames = games.map((game) => {
      const homeTeamName = teamMap.get(game.home_team_id) || 'Unknown';
      const awayTeamName = teamMap.get(game.away_team_id) || 'Unknown';
      const isHome = teamId ? game.home_team_id === teamId : null;

      // Calculate actual winner based on scores (fixes tie bug)
      const actualWinner = game.home_score !== null && game.away_score !== null
        ? (game.home_score > game.away_score ? game.home_team_id : game.away_score > game.home_score ? game.away_team_id : null)
        : game.winner_team_id;

      // Calculate is_win based on actual scores, not just winner_team_id
      const isWin = teamId && actualWinner
        ? actualWinner === teamId
        : null;

      return {
        id: game.id,
        season_number: game.season_number,
        day_number: game.day_number,
        home_team_id: game.home_team_id,
        home_team_name: homeTeamName,
        away_team_id: game.away_team_id,
        away_team_name: awayTeamName,
        home_score: game.home_score,
        away_score: game.away_score,
        winner_team_id: actualWinner,
        winner_team_name: actualWinner ? (teamMap.get(actualWinner) || 'Unknown') : null,
        is_home: isHome,
        is_win: isWin,
        overtime_count: game.overtime_count ?? 0,
      };
    });

    // Sort by day_number (desc) - most recent first
    formattedGames.sort((a, b) => b.day_number - a.day_number);

    return NextResponse.json({
      ok: true,
      games: formattedGames,
      season_number: seasonNumber,
    });
  } catch (error) {
    console.error('[Games] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch games',
      },
      { status: 500 }
    );
  }
}
