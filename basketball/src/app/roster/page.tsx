"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Player {
  id: string;
  name: string;
  position: string;
  tier: string;
  rating: number;
  age: number;
  affinity: string;
  salary_m: number;
  contract_years_remaining: number;
  games_played: number;
  points: number;
  ppg: number;
}

export default function RosterPage() {
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<Player[]>([]);
  const [teamName, setTeamName] = useState<string>("");
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRoster();
  }, []);

  async function loadRoster() {
    try {
      // Get current user
      const fidFromStorage =
        typeof window !== "undefined"
          ? localStorage.getItem("basketball_fid")
          : null;
      const fid = fidFromStorage || new URLSearchParams(window.location.search).get("fid");
      const email = new URLSearchParams(window.location.search).get("email");

      if (!fid && !email) {
        setError("Please log in first");
        setLoading(false);
        return;
      }

      // Get profile
      const profileRes = await fetch(
        `/api/profile?${fid ? `fid=${fid}` : `email=${email}`}`
      );
      const profileData = await profileRes.json();
      if (!profileData.ok) {
        setError("Profile not found");
        setLoading(false);
        return;
      }

      // Get team
      const teamRes = await fetch(
        `/api/teams?profile_id=${profileData.profile.id}`
      );
      const teamData = await teamRes.json();
      if (!teamData.ok) {
        setError("Team not found");
        setLoading(false);
        return;
      }

      setTeamName(teamData.team.name);

      // Get current season
      const stateRes = await fetch("/api/season-state");
      const stateData = await stateRes.json();
      if (stateData.ok) {
        setSeasonNumber(stateData.state.season_number);
      }

      // Get roster
      const rosterRes = await fetch(
        `/api/roster?team_id=${teamData.team.id}&season_number=${seasonNumber}`
      );
      const rosterData = await rosterRes.json();
      if (rosterData.ok) {
        setRoster(rosterData.roster);
      } else {
        setError(rosterData.error || "Failed to load roster");
      }
    } catch (err) {
      console.error("[Roster] Error:", err);
      setError("Failed to load roster");
    } finally {
      setLoading(false);
    }
  }

  function getTierColor(tier: string): string {
    switch (tier) {
      case "elite":
        return "text-purple-600 dark:text-purple-400";
      case "great":
        return "text-blue-600 dark:text-blue-400";
      case "good":
        return "text-green-600 dark:text-green-400";
      default:
        return "text-gray-600 dark:text-gray-400";
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
        <h1 className="text-3xl font-bold">Roster</h1>
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

      <div className="mb-4">
        <h2 className="text-xl font-semibold">{teamName}</h2>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Season {seasonNumber}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Pos</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Tier</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">Rating</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">Age</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Affinity</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">PPG</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">GP</th>
              <th className="px-4 py-3 text-center text-sm font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {roster.map((player) => (
              <tr
                key={player.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td className="px-4 py-3 text-sm font-medium">{player.name}</td>
                <td className="px-4 py-3 text-sm">{player.position}</td>
                <td className={`px-4 py-3 text-sm font-semibold ${getTierColor(player.tier)}`}>
                  {player.tier.toUpperCase()}
                </td>
                <td className="px-4 py-3 text-center text-sm">{player.rating.toFixed(1)}</td>
                <td className="px-4 py-3 text-center text-sm">{player.age}</td>
                <td className="px-4 py-3 text-sm">
                  {player.affinity === "StrongVsZone" ? "vs Zone" : "vs Man"}
                </td>
                <td className="px-4 py-3 text-center text-sm">
                  {player.ppg.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-center text-sm">{player.games_played}</td>
                <td className="px-4 py-3 text-center text-sm">{player.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
