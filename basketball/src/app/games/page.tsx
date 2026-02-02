"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Game {
  id: string;
  season_number: number;
  day_number: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  winner_team_id: string;
  winner_team_name: string;
  is_home: boolean | null;
  is_win: boolean | null;
  overtime_count: number;
}

export default function GamesPage() {
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<Game[]>([]);
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [gameDetails, setGameDetails] = useState<any>(null);

  useEffect(() => {
    loadGames();
  }, []);

  async function loadGames() {
    try {
      // Get current user
      const fidFromStorage =
        typeof window !== "undefined"
          ? localStorage.getItem("basketball_fid")
          : null;
      const fid = fidFromStorage || new URLSearchParams(window.location.search).get("fid");
      const email = new URLSearchParams(window.location.search).get("email");

      let teamId: string | null = null;
      if (fid || email) {
        // Get profile
        const profileRes = await fetch(
          `/api/profile?${fid ? `fid=${fid}` : `email=${email}`}`
        );
        const profileData = await profileRes.json();
        if (profileData.ok) {
          // Get team
          const teamRes = await fetch(
            `/api/teams?profile_id=${profileData.profile.id}`
          );
          const teamData = await teamRes.json();
          if (teamData.ok) {
            teamId = teamData.team.id;
          }
        }
      }

      // Get current season
      const stateRes = await fetch("/api/season-state");
      const stateData = await stateRes.json();
      if (stateData.ok) {
        setSeasonNumber(stateData.state.season_number);
      }

      // Get games
      const gamesRes = await fetch(
        `/api/games?${teamId ? `team_id=${teamId}&` : ""}season_number=${seasonNumber}`
      );
      const gamesData = await gamesRes.json();
      if (gamesData.ok) {
        setGames(gamesData.games);
      } else {
        setError(gamesData.error || "Failed to load games");
      }
    } catch (err) {
      console.error("[Games] Error:", err);
      setError("Failed to load games");
    } finally {
      setLoading(false);
    }
  }

  async function loadGameDetails(gameId: string) {
    try {
      const res = await fetch(`/api/games/${gameId}`);
      const data = await res.json();
      if (data.ok) {
        setGameDetails(data);
        setSelectedGame(gameId);
      }
    } catch (err) {
      console.error("[Game Details] Error:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Game Log</h1>
        <Link
          href="/dashboard"
          className="rounded bg-gray-200 px-4 py-2 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Season {seasonNumber}
      </div>

      <div className="space-y-4">
        {games.map((game) => (
          <div
            key={game.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span>Day {game.day_number}</span>
                  {game.overtime_count > 0 && (
                    <span className="rounded bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {game.overtime_count === 1 ? 'OT' : `${game.overtime_count}OT`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div
                    className={`flex-1 ${
                      game.winner_team_id === game.home_team_id
                        ? "font-bold"
                        : ""
                    }`}
                  >
                    {game.home_team_name} {game.home_score}
                  </div>
                  <div className="text-gray-400">vs</div>
                  <div
                    className={`flex-1 ${
                      game.winner_team_id === game.away_team_id
                        ? "font-bold"
                        : ""
                    }`}
                  >
                    {game.away_team_name} {game.away_score}
                  </div>
                </div>
                {game.is_win !== null && (
                  <div
                    className={`mt-2 text-sm ${
                      game.is_win
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {game.is_win ? "✓ Win" : "✗ Loss"}
                  </div>
                )}
              </div>
              <button
                onClick={() => loadGameDetails(game.id)}
                className="ml-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              >
                {selectedGame === game.id ? "Hide Details" : "View Details"}
              </button>
            </div>

            {selectedGame === game.id && gameDetails && (
              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                {gameDetails.game.overtime_count > 0 && (
                  <div className="mb-3 text-center">
                    <span className="rounded bg-orange-500 px-3 py-1 text-sm font-semibold text-white">
                      {gameDetails.game.overtime_count === 1 ? 'Overtime' : `${gameDetails.game.overtime_count} Overtimes`}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="mb-2 font-semibold">
                      {gameDetails.game.home_team_name}
                    </h3>
                    <div className="space-y-1 text-sm">
                      {gameDetails.home_players.map((player: any) => (
                        <div key={player.player_id} className="flex justify-between">
                          <span>
                            {player.player_name} ({player.position})
                          </span>
                          <span className="font-medium">{player.points} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold">
                      {gameDetails.game.away_team_name}
                    </h3>
                    <div className="space-y-1 text-sm">
                      {gameDetails.away_players.map((player: any) => (
                        <div key={player.player_id} className="flex justify-between">
                          <span>
                            {player.player_name} ({player.position})
                          </span>
                          <span className="font-medium">{player.points} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {games.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
            <p className="text-gray-600 dark:text-gray-400">No games played yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
