"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SeasonState {
  season_number: number;
  day_number: number;
  phase: string;
  day_type: string;
}

interface Team {
  id: string;
  name: string;
  owner_profile_id: string;
  prep_boost_active: boolean;
}

interface Profile {
  id: string;
  auth_type: string;
  farcaster_fid?: number;
  email?: string;
  is_admin?: boolean;
}

interface NextOpponent {
  team_id: string;
  team_name: string;
  day_number: number;
  is_home: boolean;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [seasonState, setSeasonState] = useState<SeasonState | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offdayAction, setOffdayAction] = useState<string | null>(null);
  const [gameplan, setGameplan] = useState<{
    offense: string;
    defense: string;
    mentality: string;
  } | null>(null);
  const [nextOpponent, setNextOpponent] = useState<NextOpponent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      // Get current user (for MVP, we'll use localStorage for FID or URL param for email)
      // In production, this would come from session/auth
      const fidFromStorage = typeof window !== "undefined" ? localStorage.getItem("basketball_fid") : null;
      const fid = fidFromStorage || new URLSearchParams(window.location.search).get("fid");
      const email = new URLSearchParams(window.location.search).get("email");

      if (!fid && !email) {
        setError("Please log in first");
        setLoading(false);
        return;
      }

      // Parallelize independent API calls (optimization)
      const [profileRes, stateRes] = await Promise.all([
        fetch(`/api/profile?${fid ? `fid=${fid}` : `email=${email}`}`),
        fetch("/api/season-state")
      ]);

      const profileData = await profileRes.json();
      if (!profileData.ok) {
        setError("Profile not found");
        setLoading(false);
        return;
      }
      setProfile(profileData.profile);

      const stateData = await stateRes.json();
      if (!stateData.ok) {
        setError("Failed to load season state");
        setLoading(false);
        return;
      }
      setSeasonState(stateData.state);

      // Get team (depends on profile)
      const teamRes = await fetch(
        `/api/teams?profile_id=${profileData.profile.id}`
      );
      const teamData = await teamRes.json();
      if (!teamData.ok) {
        setError("Team not found");
        setLoading(false);
        return;
      }
      setTeam(teamData.team);

      if (stateData.ok) {
        // Calculate next game day
        const nextGameDay = stateData.state.day_type === "OFFDAY"
          ? stateData.state.day_number + 1  // Next day is GAMENIGHT
          : stateData.state.day_number + 2; // Skip next OFFDAY, go to next GAMENIGHT

        // Parallelize independent API calls (optimization)
        const apiCalls: Promise<Response>[] = [
          // Get gameplan for next game
          fetch(`/api/gameplans?team_id=${teamData.team.id}&season_number=${stateData.state.season_number}&day_number=${nextGameDay}`),
          // Get next opponent
          fetch(`/api/next-opponent?team_id=${teamData.team.id}`)
        ];

        // Get current offday action if OFFDAY (conditional call)
        let actionRes: Response | null = null;
        if (stateData.state.day_type === "OFFDAY") {
          actionRes = await fetch(
            `/api/offday-actions?team_id=${teamData.team.id}&season_number=${stateData.state.season_number}&day_number=${stateData.state.day_number}`
          );
        }

        // Execute independent calls in parallel
        const [gameplanRes, opponentRes] = await Promise.all(apiCalls);

        // Process offday action response
        if (actionRes) {
          const actionData = await actionRes.json();
          if (actionData.ok && actionData.action) {
            setOffdayAction(actionData.action.action);
          }
        }

        // Process gameplan response
        const gameplanData = await gameplanRes.json();
        if (gameplanData.ok) {
          if (gameplanData.gameplan) {
            // Existing gameplan found - use it
            setGameplan({
              offense: gameplanData.gameplan.offense,
              defense: gameplanData.gameplan.defense,
              mentality: gameplanData.gameplan.mentality,
            });
          } else {
            // No gameplan exists - initialize with defaults so buttons work correctly
            // This ensures state is always available for button handlers
            setGameplan({
              offense: "Drive",
              defense: "Zone",
              mentality: "Neutral",
            });
          }
        }

        // Process opponent response
        const opponentData = await opponentRes.json();
        if (opponentData.ok && opponentData.opponent) {
          setNextOpponent(opponentData.opponent);
        }
      }
    } catch (err) {
      console.error("[Dashboard] Error:", err);
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function submitOffdayAction(action: "TRAIN" | "PREP") {
    if (!team || !seasonState) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/offday-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: team.id,
          action: action,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setOffdayAction(action);
        // Reload team to get updated prep_boost_active
        const teamRes = await fetch(`/api/teams?profile_id=${profile?.id}`);
        const teamData = await teamRes.json();
        if (teamData.ok) {
          setTeam(teamData.team);
        }
      } else {
        setError(data.error || "Failed to submit action");
      }
    } catch (err) {
      setError("Failed to submit action");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitGameplan(
    offense: "Drive" | "Shoot",
    defense: "Zone" | "Man",
    mentality: "Aggressive" | "Conservative" | "Neutral"
  ) {
    if (!team || !seasonState) return;

    // Optimistic state update - update immediately for better UX
    // This ensures subsequent button clicks use the updated state
    const previousGameplan = gameplan;
    setGameplan({ offense, defense, mentality });

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/gameplans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: team.id,
          offense: offense,
          defense: defense,
          mentality: mentality,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        // State already updated optimistically, but ensure it's correct
        setGameplan({ offense, defense, mentality });
      } else {
        // API call failed - revert to previous state
        if (previousGameplan) {
          setGameplan(previousGameplan);
        } else {
          // If no previous state, reload from API to get correct state
          const nextGameDay = seasonState.day_type === "OFFDAY"
            ? seasonState.day_number + 1
            : seasonState.day_number + 2;
          const gameplanRes = await fetch(
            `/api/gameplans?team_id=${team.id}&season_number=${seasonState.season_number}&day_number=${nextGameDay}`
          );
          const gameplanData = await gameplanRes.json();
          if (gameplanData.ok && gameplanData.gameplan) {
            setGameplan({
              offense: gameplanData.gameplan.offense,
              defense: gameplanData.gameplan.defense,
              mentality: gameplanData.gameplan.mentality,
            });
          }
        }
        setError(data.error || "Failed to submit gameplan");
      }
    } catch (err) {
      // Network error - revert to previous state
      if (previousGameplan) {
        setGameplan(previousGameplan);
      }
      setError("Failed to submit gameplan");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdminAction(action: "advance" | "simulate" | "initialize" | "offseason") {
    setAdminSubmitting(true);
    setError(null);

    try {
      let endpoint = "";
      if (action === "advance") {
        endpoint = "/api/admin/advance";
      } else if (action === "simulate") {
        endpoint = "/api/admin/simulate";
      } else if (action === "initialize") {
        endpoint = "/api/admin/initialize";
      } else if (action === "offseason") {
        endpoint = "/api/admin/offseason";
      }

      const res = await fetch(endpoint, {
        method: "POST",
      });

      const data = await res.json();
      if (data.ok) {
        // Reload dashboard
        await loadDashboard();
        alert(data.message || "Action completed successfully");
      } else {
        setError(data.error || "Failed to execute action");
      }
    } catch (err) {
      setError("Failed to execute action");
    } finally {
      setAdminSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error && !team) {
    return (
      <div className="container mx-auto p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-3xl font-bold">Dashboard</h1>

      {/* Season State */}
      {seasonState && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-xl font-semibold">Season Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-gray-600 dark:text-gray-400">Season:</span>{" "}
              <span className="font-semibold">{seasonState.season_number}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Day:</span>{" "}
              <span className="font-semibold">{seasonState.day_number}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Phase:</span>{" "}
              <span className="font-semibold">{seasonState.phase}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Day Type:</span>{" "}
              <span className="font-semibold">{seasonState.day_type}</span>
            </div>
          </div>
        </div>
      )}

      {/* Team Info */}
      {team && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-xl font-semibold">Your Team</h2>
          <p className="text-lg font-bold">{team.name}</p>
          {team.prep_boost_active && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
              ⚡ Prep boost active for next game
            </p>
          )}
        </div>
      )}

      {/* Next Opponent */}
      {nextOpponent && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-xl font-semibold">Next Game</h2>
          <p className="text-lg">
            {nextOpponent.is_home ? "🏠 Home" : "✈️ Away"} vs{" "}
            <span className="font-bold">{nextOpponent.team_name}</span>
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Day {nextOpponent.day_number}
          </p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="mb-6 flex flex-wrap gap-4">
        <Link
          href="/standings"
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          View Standings
        </Link>
        <Link
          href="/roster"
          className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
        >
          View Roster
        </Link>
        <Link
          href="/games"
          className="rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
        >
          View Game Log
        </Link>
      </div>

      {/* Offday Actions (only show on OFFDAY) */}
      {seasonState?.day_type === "OFFDAY" && team && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-xl font-semibold">Offday Action</h2>
          {offdayAction && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Current: <span className="font-semibold">{offdayAction}</span>
            </p>
          )}
          <div className="flex gap-4">
            <button
              onClick={() => submitOffdayAction("TRAIN")}
              disabled={submitting || offdayAction === "TRAIN"}
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {offdayAction === "TRAIN" ? "✓ TRAIN" : "TRAIN"}
            </button>
            <button
              onClick={() => submitOffdayAction("PREP")}
              disabled={submitting || offdayAction === "PREP"}
              className="rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600 disabled:opacity-50"
            >
              {offdayAction === "PREP" ? "✓ PREP" : "PREP"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            TRAIN: +0.1% rating boost to all players | PREP: +25% boost for next game
          </p>
        </div>
      )}

      {/* Gameplan Submission */}
      {team && seasonState && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-xl font-semibold">Gameplan for Next Game</h2>
          {gameplan && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Current: {gameplan.offense} / {gameplan.defense} / {gameplan.mentality}
            </p>
          )}

          <div className="space-y-4">
            {/* Offense */}
            <div>
              <label className="mb-2 block text-sm font-medium">Offense</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Ensure we have current state (always initialized with defaults if null)
                    const current = gameplan || { offense: "Drive", defense: "Zone", mentality: "Neutral" };
                    submitGameplan("Drive", current.defense as "Zone" | "Man", current.mentality as "Aggressive" | "Conservative" | "Neutral");
                  }}
                  disabled={submitting}
                  className={`rounded px-4 py-2 ${
                    gameplan?.offense === "Drive"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  } disabled:opacity-50`}
                >
                  Drive
                </button>
                <button
                  onClick={() => {
                    // Ensure we have current state (always initialized with defaults if null)
                    const current = gameplan || { offense: "Drive", defense: "Zone", mentality: "Neutral" };
                    submitGameplan("Shoot", current.defense as "Zone" | "Man", current.mentality as "Aggressive" | "Conservative" | "Neutral");
                  }}
                  disabled={submitting}
                  className={`rounded px-4 py-2 ${
                    gameplan?.offense === "Shoot"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  } disabled:opacity-50`}
                >
                  Shoot
                </button>
              </div>
            </div>

            {/* Defense */}
            <div>
              <label className="mb-2 block text-sm font-medium">Defense</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Ensure we have current state (always initialized with defaults if null)
                    const current = gameplan || { offense: "Drive", defense: "Zone", mentality: "Neutral" };
                    submitGameplan(current.offense as "Drive" | "Shoot", "Zone", current.mentality as "Aggressive" | "Conservative" | "Neutral");
                  }}
                  disabled={submitting}
                  className={`rounded px-4 py-2 ${
                    gameplan?.defense === "Zone"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  } disabled:opacity-50`}
                >
                  Zone
                </button>
                <button
                  onClick={() => {
                    // Ensure we have current state (always initialized with defaults if null)
                    const current = gameplan || { offense: "Drive", defense: "Zone", mentality: "Neutral" };
                    submitGameplan(current.offense as "Drive" | "Shoot", "Man", current.mentality as "Aggressive" | "Conservative" | "Neutral");
                  }}
                  disabled={submitting}
                  className={`rounded px-4 py-2 ${
                    gameplan?.defense === "Man"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  } disabled:opacity-50`}
                >
                  Man
                </button>
              </div>
            </div>

            {/* Mentality */}
            <div>
              <label className="mb-2 block text-sm font-medium">Mentality</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Ensure we have current state (always initialized with defaults if null)
                    const current = gameplan || { offense: "Drive", defense: "Zone", mentality: "Neutral" };
                    submitGameplan(current.offense as "Drive" | "Shoot", current.defense as "Zone" | "Man", "Aggressive");
                  }}
                  disabled={submitting}
                  className={`rounded px-4 py-2 ${
                    gameplan?.mentality === "Aggressive"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  } disabled:opacity-50`}
                >
                  Aggressive
                </button>
                <button
                  onClick={() => {
                    // Ensure we have current state (always initialized with defaults if null)
                    const current = gameplan || { offense: "Drive", defense: "Zone", mentality: "Neutral" };
                    submitGameplan(current.offense as "Drive" | "Shoot", current.defense as "Zone" | "Man", "Conservative");
                  }}
                  disabled={submitting}
                  className={`rounded px-4 py-2 ${
                    gameplan?.mentality === "Conservative"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  } disabled:opacity-50`}
                >
                  Conservative
                </button>
                <button
                  onClick={() => {
                    // Ensure we have current state (always initialized with defaults if null)
                    const current = gameplan || { offense: "Drive", defense: "Zone", mentality: "Neutral" };
                    submitGameplan(current.offense as "Drive" | "Shoot", current.defense as "Zone" | "Man", "Neutral");
                  }}
                  disabled={submitting}
                  className={`rounded px-4 py-2 ${
                    gameplan?.mentality === "Neutral"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  } disabled:opacity-50`}
                >
                  Neutral
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Controls */}
      {profile?.is_admin && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-6 shadow dark:border-yellow-800 dark:bg-yellow-900/20">
          <h2 className="mb-4 text-xl font-semibold">Admin Controls</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => handleAdminAction("advance")}
              disabled={adminSubmitting}
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {adminSubmitting ? "Processing..." : "Advance Day"}
            </button>
            {seasonState?.day_type === "GAMENIGHT" && (
              <button
                onClick={() => handleAdminAction("simulate")}
                disabled={adminSubmitting}
                className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
              >
                {adminSubmitting ? "Simulating..." : "Simulate Game Night"}
              </button>
            )}
            <button
              onClick={() => handleAdminAction("initialize")}
              disabled={adminSubmitting}
              className="rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600 disabled:opacity-50"
            >
              {adminSubmitting ? "Initializing..." : "Initialize League"}
            </button>
            {seasonState?.phase === "OFFSEASON" && (
              <button
                onClick={() => handleAdminAction("offseason")}
                disabled={adminSubmitting}
                className="rounded bg-orange-500 px-4 py-2 text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {adminSubmitting ? "Processing..." : "Process Offseason"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
