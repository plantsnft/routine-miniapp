"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "~/components/AuthProvider";
import { authedFetch } from "~/lib/authedFetch";
import { TOTAL_MATCHUPS } from "~/lib/ncaaHoops";

type Slot = { slot_id: string; display_label: string; display_name?: string | null };
type Matchup = { matchup_id: number; round: number; slot_a_id: string; slot_b_id: string };

export default function NcaaHoopsSubmitClient() {
  const { token, status: authStatus } = useAuth();
  const searchParams = useSearchParams();
  const contestId = searchParams.get("contestId")?.trim() ?? null;

  const [contest, setContest] = useState<{ id: string; title?: string; slots?: Slot[]; matchups?: Matchup[] } | null>(null);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadContest = useCallback(async () => {
    if (!contestId) return;
    const res = await fetch(`/api/ncaa-hoops/contests/${contestId}`);
    const d = await res.json();
    if (d?.ok && d?.data) setContest(d.data);
    else setContest(null);
  }, [contestId]);

  useEffect(() => {
    if (!contestId) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      await loadContest();
      setLoading(false);
    })();
  }, [contestId, loadContest]);

  const handlePick = (matchupId: number, winnerSlotId: string) => {
    setPicks((prev) => ({ ...prev, [matchupId]: winnerSlotId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !contestId) return;
    const arr = [];
    for (let m = 1; m <= TOTAL_MATCHUPS; m++) {
      const winner = picks[m];
      if (!winner) {
        setError(`Pick required for matchup ${m}`);
        return;
      }
      arr.push({ matchup_id: m, winner_slot_id: winner });
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/ncaa-hoops/contests/${contestId}/brackets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: arr }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Submit failed");
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (authStatus === "loading" || !token) {
    return (
      <div className="p-6" style={{ color: "var(--text-0)" }}>
        Loading… Sign in required to submit.
      </div>
    );
  }

  if (!contestId || !contest) {
    return (
      <div className="p-6">
        <Link href="/ncaa-hoops" style={{ color: "var(--text-1)" }}>← Back</Link>
        <p style={{ color: "var(--text-1)", marginTop: "16px" }}>No contest specified or contest not found.</p>
      </div>
    );
  }

  const slots = contest.slots ?? [];
  const filled = Object.keys(picks).length;

  if (success) {
    return (
      <div className="p-6">
        <p style={{ color: "var(--text-0)", marginBottom: "16px" }}>Bracket submitted.</p>
        <Link href={`/ncaa-hoops?contestId=${contestId}`} style={{ color: "var(--fire-1)" }}>Back to contest</Link>
      </div>
    );
  }

  return (
    <div className="p-6" style={{ maxWidth: "640px", margin: "0 auto" }}>
      <Link href={`/ncaa-hoops?contestId=${contestId}`} style={{ color: "var(--text-1)", marginBottom: "16px", display: "inline-block" }}>← Back</Link>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "8px", color: "var(--text-0)" }}>Submit bracket</h1>
      <p style={{ color: "var(--text-1)", fontSize: "0.875rem", marginBottom: "16px" }}>
        {contest.title}. Pick the winner for each of 63 matchups. You have {filled} / {TOTAL_MATCHUPS} picks.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {Array.from({ length: TOTAL_MATCHUPS }, (_, i) => i + 1).map((matchupId) => (
            <div key={matchupId} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <label style={{ minWidth: "80px", color: "var(--text-1)", fontSize: "0.875rem" }}>Matchup {matchupId}</label>
              <select
                value={picks[matchupId] ?? ""}
                onChange={(e) => handlePick(matchupId, e.target.value)}
                style={{
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--stroke)",
                  background: "var(--bg-2)",
                  color: "var(--text-0)",
                  minWidth: "180px",
                }}
              >
                <option value="">—</option>
                {slots.map((s) => (
                  <option key={s.slot_id} value={s.slot_id}>
                    {s.display_label}{s.display_name ? ` • ${s.display_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {error && <p style={{ color: "var(--ember-2)", marginBottom: "12px" }}>{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting || filled < TOTAL_MATCHUPS}>
          {submitting ? "Submitting…" : "Submit bracket"}
        </button>
      </form>
    </div>
  );
}
