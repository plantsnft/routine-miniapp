import { NextRequest, NextResponse } from 'next/server';
import { basketballDb } from '~/lib/basketballDb';

/**
 * GET /api/games/[gameId]
 * Get detailed game info including player points
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    // Validate gameId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(gameId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid gameId format. Must be a valid UUID.' },
        { status: 400 }
      );
    }

    // Get game
    const games = await basketballDb.fetch('games', {
      filters: { id: gameId },
      limit: 1,
    });

    if (games.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Game not found' },
        { status: 404 }
      );
    }

    const game = games[0];

    // Get player lines for this game first (need player IDs)
    const playerLines = await basketballDb.fetch('game_player_lines', {
      filters: { game_id: gameId },
    });

    // Fetch only needed teams (optimization: use in operator)
    const teams = await basketballDb.fetch('teams', {
      filters: { 
        id: { in: [game.home_team_id, game.away_team_id] }
      }
    });
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));
    const homeTeamName = teamMap.get(game.home_team_id) || 'Unknown';
    const awayTeamName = teamMap.get(game.away_team_id) || 'Unknown';

    // Fetch only players in this game (optimization: use in operator)
    const playerIds = playerLines.map(line => line.player_id);
    const players = playerIds.length > 0 
      ? await basketballDb.fetch('players', {
          filters: { 
            id: { in: playerIds }
          }
        })
      : [];
    const playerMap = new Map(players.map((p) => [p.id, p]));

    // Group player lines by team
    const homePlayers = playerLines
      .filter((line) => line.team_id === game.home_team_id)
      .map((line) => {
        const player = playerMap.get(line.player_id);
        return {
          player_id: line.player_id,
          player_name: player?.name || 'Unknown',
          position: player?.position || 'N/A',
          points: line.points,
        };
      })
      .sort((a, b) => b.points - a.points); // Sort by points desc

    const awayPlayers = playerLines
      .filter((line) => line.team_id === game.away_team_id)
      .map((line) => {
        const player = playerMap.get(line.player_id);
        return {
          player_id: line.player_id,
          player_name: player?.name || 'Unknown',
          position: player?.position || 'N/A',
          points: line.points,
        };
      })
      .sort((a, b) => b.points - a.points); // Sort by points desc

    return NextResponse.json({
      ok: true,
      game: {
        id: game.id,
        season_number: game.season_number,
        day_number: game.day_number,
        home_team_id: game.home_team_id,
        home_team_name: homeTeamName,
        away_team_id: game.away_team_id,
        away_team_name: awayTeamName,
        home_score: game.home_score,
        away_score: game.away_score,
        winner_team_id: game.winner_team_id,
        winner_team_name: teamMap.get(game.winner_team_id) || 'Unknown',
        overtime_count: game.overtime_count ?? 0,
      },
      home_players: homePlayers,
      away_players: awayPlayers,
    });
  } catch (error) {
    console.error('[Game Detail] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch game details',
      },
      { status: 500 }
    );
  }
}
