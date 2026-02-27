"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "~/components/AuthProvider";
import { authedFetch } from "~/lib/authedFetch";

type Contest = {
  id: string;
  title?: string;
  status: string;
  is_preview?: boolean;
  picks_close_at?: string | null;
  last_sync_at?: string | null;
  last_sync_result_count?: number | null;
  slots?: { slot_id: string; display_label: string; display_name?: string | null }[];
  matchups?: { matchup_id: number; round: number; slot_a_id: string; slot_b_id: string }[];
};

type StatusData = {
  registered: boolean;
  allowedEntries: number;
  usedEntries: number;
  activeContest: { id: string; title?: string; status: string } | null;
};

type LeaderboardEntry = {
  rank: number;
  bracketId: string;
  fid: number;
  totalScore: number;
  championshipCorrect: boolean;
};

export default function NcaaHoopsClient() {
  const { token, status: authStatus } = useAuth();
  const searchParams = useSearchParams();
  const contestIdParam = searchParams.get("contestId")?.trim() || null;

  const [contest, setContest] = useState<Contest | null>(null);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingPicks, setClosingPicks] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [settling, setSettling] = useState(false);

  const effectiveContestId = contest?.id ?? contestIdParam;

  const loadContest = useCallback(async () => {
    if (contestIdParam) {
      const res = await fetch(`/api/ncaa-hoops/contests/${contestIdParam}`);
      const d = await res.json();
      if (d?.ok && d?.data) setContest(d.data);
      else setContest(null);
      return;
    }
    const res = await fetch("/api/ncaa-hoops/contests/active");
    const d = await res.json();
    if (d?.ok && d?.data) {
      setContest(d.data);
      return;
    }
    setContest(null);
  }, [contestIdParam]);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    const res = await authedFetch("/api/ncaa-hoops/status", { method: "GET" }, token);
    const d = await res.json();
    if (d?.ok && d?.data) setStatusData(d.data);
  }, [token]);

  const loadLeaderboard = useCallback(async () => {
    if (!effectiveContestId) return;
    const res = await fetch(`/api/ncaa-hoops/contests/${effectiveContestId}/leaderboard`);
    const d = await res.json();
    if (d?.ok && Array.isArray(d?.data)) setLeaderboard(d.data);
  }, [effectiveContestId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadContest();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadContest]);

  useEffect(() => {
    if (authStatus !== "authed" || !token) return;
    (async () => {
      try {
        const [st, adm] = await Promise.all([
          authedFetch("/api/ncaa-hoops/status", { method: "GET" }, token).then((r) => r.json()),
          authedFetch("/api/admin/status", { method: "GET" }, token).then((r) => r.json()),
        ]);
        if (st?.ok && st?.data) setStatusData(st.data);
        if (adm?.ok && adm?.data?.isAdmin) setIsAdmin(true);
      } catch {
        // ignore
      }
    })();
  }, [authStatus, token]);

  useEffect(() => {
    if (!effectiveContestId) return;
    loadLeaderboard();
  }, [effectiveContestId, loadLeaderboard]);

  const handleClosePicks = async () => {
    if (!token || !effectiveContestId) return;
    setClosingPicks(true);
    try {
      const res = await authedFetch(`/api/ncaa-hoops/contests/${effectiveContestId}/close-picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }, token);
      const d = await res.json();
      if (d?.ok) await loadContest();
      else alert(d?.error || "Failed to close picks");
    } finally {
      setClosingPicks(false);
    }
  };

  const handleSyncResults = async () => {
    if (!token || !effectiveContestId) return;
    setSyncing(true);
    try {
      const res = await authedFetch(`/api/ncaa-hoops/contests/${effectiveContestId}/sync-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }, token);
      const d = await res.json();
      if (d?.ok) {
        await loadContest();
        await loadLeaderboard();
      } else alert(d?.error || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSettle = async () => {
    if (!token || !effectiveContestId) return;
    if (!confirm("Settle contest? This will finalize rankings.")) return;
    setSettling(true);
    try {
      const res = await authedFetch(`/api/ncaa-hoops/contests/${effectiveContestId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, token);
      const d = await res.json();
      if (d?.ok) await loadContest();
      else alert(d?.error || "Settle failed");
    } finally {
      setSettling(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6" style={{ color: "var(--text-0)" }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6" style={{ color: "var(--ember-2)" }}>
        {error}
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="p-6">
        <Link href="/" style={{ color: "var(--text-1)", marginBottom: "16px", display: "inline-block" }}>← Back</Link>
        <p style={{ color: "var(--text-1)" }}>No active NCAA HOOPS contest right now.</p>
      </div>
    );
  }

  const isOpen = contest.status === "open";
  const isSettled = contest.status === "settled";

  return (
    <div className="p-6" style={{ maxWidth: "640px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "var(--text-1)", marginBottom: "16px", display: "inline-block" }}>← Back to games</Link>

      <h1 style={{ fontSize: "1.5rem", marginBottom: "8px", color: "var(--text-0)" }}>
        {contest.title ?? "NCAA HOOPS"}
      </h1>
      <p style={{ color: "var(--text-1)", fontSize: "0.875rem", marginBottom: "16px" }}>
        Status: {contest.status} {contest.last_sync_result_count != null && ` · ${contest.last_sync_result_count} of 63 results`}
      </p>

      {statusData && (
        <p style={{ color: "var(--text-1)", fontSize: "0.875rem", marginBottom: "16px" }}>
          Your entries: {statusData.usedEntries} / {statusData.allowedEntries}
        </p>
      )}

      {isOpen && (
        <p style={{ marginBottom: "16px" }}>
          <a
            href={`/ncaa-hoops/submit?contestId=${contest.id}`}
            style={{ color: "var(--fire-1)", textDecoration: "underline" }}
          >
            Submit bracket
          </a> (63 picks required)
        </p>
      )}

      <h2 style={{ fontSize: "1.125rem", marginTop: "24px", marginBottom: "8px", color: "var(--text-0)" }}>Leaderboard</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {leaderboard.slice(0, 20).map((e) => (
          <li key={e.bracketId} style={{ padding: "8px 0", borderBottom: "1px solid var(--stroke)", color: "var(--text-0)" }}>
            #{e.rank} FID {e.fid} — {e.totalScore} pts {e.championshipCorrect ? " (champ ✓)" : ""}
          </li>
        ))}
      </ul>
      {leaderboard.length === 0 && <p style={{ color: "var(--text-1)", fontSize: "0.875rem" }}>No entries yet.</p>}

      {isAdmin && (
        <div style={{ marginTop: "24px", padding: "16px", border: "1px solid var(--stroke)", borderRadius: "8px" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "12px", color: "var(--text-0)" }}>Admin</h3>
          {isOpen && (
            <button type="button" className="btn-primary" onClick={handleClosePicks} disabled={closingPicks} style={{ marginRight: "8px", marginBottom: "8px" }}>
              {closingPicks ? "Closing…" : "Close picks"}
            </button>
          )}
          {(contest.status === "picks_closed" || contest.status === "in_progress") && (
            <button type="button" className="btn-secondary" onClick={handleSyncResults} disabled={syncing} style={{ marginRight: "8px", marginBottom: "8px" }}>
              {syncing ? "Syncing…" : "Sync results from ESPN"}
            </button>
          )}
          {(contest.status === "picks_closed" || contest.status === "in_progress") && (
            <button type="button" className="btn-secondary" onClick={handleSettle} disabled={settling} style={{ marginBottom: "8px" }}>
              {settling ? "Settling…" : "Settle contest"}
            </button>
          )}
        </div>
      )}

      {isSettled && (
        <p style={{ marginTop: "16px" }}>
          <Link href="/results" style={{ color: "var(--fire-1)", textDecoration: "underline" }}>View results</Link>
        </p>
      )}
    </div>
  );
}
