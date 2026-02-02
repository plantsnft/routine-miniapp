"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Standing {
  team_id: string;
  team_name: string;
  wins: number;
  losses: number;
  games_played: number;
  points_for: number;
  points_against: number;
  win_percentage: number;
  ppg: number;
  opp_ppg: number;
}

export default function StandingsPage() {
  const [loading, setLoading] = useState(true);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStandings();
  }, []);

  async function loadStandings() {
    try {
      // Get current season
      const stateRes = await fetch("/api/season-state");
      const stateData = await stateRes.json();
      if (stateData.ok) {
        setSeasonNumber(stateData.state.season_number);
      }

      // Get standings
      const res = await fetch(`/api/standings?season_number=${seasonNumber}`);
      const data = await res.json();
      if (data.ok) {
        setStandings(data.standings);
      } else {
        setError(data.error || "Failed to load standings");
      }
    } catch (err) {
      console.error("[Standings] Error:", err);
      setError("Failed to load standings");
    } finally {
      setLoading(false);
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
        <h1 className="text-3xl font-bold">Standings</h1>
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

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Rank</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Team</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">W</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">L</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">W%</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">PPG</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">Opp PPG</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {standings.map((standing, index) => (
              <tr
                key={standing.team_id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td className="px-4 py-3 text-sm font-medium">{index + 1}</td>
                <td className="px-4 py-3 text-sm font-semibold">
                  {standing.team_name}
                </td>
                <td className="px-4 py-3 text-center text-sm">{standing.wins}</td>
                <td className="px-4 py-3 text-center text-sm">{standing.losses}</td>
                <td className="px-4 py-3 text-center text-sm">
                  {standing.win_percentage.toFixed(3)}
                </td>
                <td className="px-4 py-3 text-center text-sm">
                  {standing.ppg.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-center text-sm">
                  {standing.opp_ppg.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
