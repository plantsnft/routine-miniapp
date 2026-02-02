import { NextRequest, NextResponse } from 'next/server';
import { basketballDb } from '~/lib/basketballDb';

/**
 * GET /api/roster?team_id=xxx&season_number=1
 * Get roster (players) for a team with their season stats
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('team_id');
    const seasonNumber = parseInt(searchParams.get('season_number') || '1', 10);

    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: 'team_id required' },
        { status: 400 }
      );
    }

    // Validate season_number
    if (seasonNumber < 1 || !Number.isInteger(seasonNumber)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid season_number. Must be a positive integer.' },
        { status: 400 }
      );
    }

    // Get all players for this team
    const players = await basketballDb.fetch('players', {
      filters: { team_id: teamId },
    });

    // Fetch stats only for players on this team (optimization: use in operator)
    const playerIds = players.map(p => p.id);
    const stats = playerIds.length > 0
      ? await basketballDb.fetch('player_season_stats', {
          filters: {
            season_number: seasonNumber,
            player_id: { in: playerIds }
          },
        })
      : [];

    // Create stats lookup map
    const statsMap = new Map(stats.map(s => [s.player_id, s]));

    // Combine players with their stats
    const roster = players.map((player) => {
      const stat = statsMap.get(player.id);
      
      const gamesPlayed = stat?.games_played || 0;
      const points = stat?.points || 0;
      const ppg = gamesPlayed > 0 ? points / gamesPlayed : 0;

      return {
        id: player.id,
        name: player.name,
        position: player.position,
        tier: player.tier,
        rating: player.rating,
        age: player.age,
        affinity: player.affinity,
        salary_m: player.salary_m,
        contract_years_remaining: player.contract_years_remaining,
        games_played: gamesPlayed,
        points: points,
        ppg: ppg,
      };
    });

    // Sort by position (PG, SG, SF, PF, C)
    const positionOrder: Record<string, number> = {
      PG: 1,
      SG: 2,
      SF: 3,
      PF: 4,
      C: 5,
    };
    roster.sort((a, b) => {
      return (positionOrder[a.position] || 99) - (positionOrder[b.position] || 99);
    });

    return NextResponse.json({
      ok: true,
      roster,
      season_number: seasonNumber,
    });
  } catch (error) {
    console.error('[Roster] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch roster',
      },
      { status: 500 }
    );
  }
}
