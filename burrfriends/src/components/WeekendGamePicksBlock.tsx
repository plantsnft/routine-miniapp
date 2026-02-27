"use client";

import React, { useState, useEffect } from "react";
import { authedFetch } from "~/lib/authedFetch";

const ADVANTAGE_COPY =
  "Your advantage is you get to choose two people in your next game — @burr.eth will be sending you a private DC.";
const BULLIED_RULE = "BULLIED: 3 go in, 1 or none advance.";

type PoolPlayer = { fid: number; username?: string | null; display_name?: string | null };
type WinnerPick = {
  winner_fid: number;
  position: number;
  username?: string | null;
  display_name?: string | null;
  pick_1_fid: number | null;
  pick_2_fid: number | null;
  submitted_at: string | null;
  pick_1_username?: string | null;
  pick_2_username?: string | null;
};
type PicksData = {
  roundId: string;
  roundLabel: string | null;
  roundStatus?: string;
  picksLockedAt?: string | null;
  winners: WinnerPick[];
};

interface WeekendGamePicksBlockProps {
  roundId: string;
  token: string | null;
  currentFid: number | null;
  isAdmin: boolean;
}

export function WeekendGamePicksBlock({ roundId, token, currentFid, isAdmin }: WeekendGamePicksBlockProps) {
  const [pickPool, setPickPool] = useState<PoolPlayer[]>([]);
  const [picksData, setPicksData] = useState<PicksData | null>(null);
  const [pick1Fid, setPick1Fid] = useState("");
  const [pick2Fid, setPick2Fid] = useState("");
  const [submittingPicks, setSubmittingPicks] = useState(false);
  const [picksError, setPicksError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authedFetch(`/api/weekend-game/rounds/${roundId}/pick-pool`, { method: "GET" }, token)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d?.data?.pool)) setPickPool(d.data.pool);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, roundId]);

  const fetchPicks = () => {
    if (!token) return;
    authedFetch(`/api/weekend-game/rounds/${roundId}/picks`, { method: "GET" }, token)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.data) setPicksData(d.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!token) {
      setPicksData(null);
      return;
    }
    fetchPicks();
    const interval = setInterval(fetchPicks, 8000);
    return () => clearInterval(interval);
  }, [token, roundId]);

  const picksEditable =
    (picksData?.picksLockedAt == null || picksData?.picksLockedAt === "") &&
    picksData?.roundStatus !== "settled";

  useEffect(() => {
    if (!picksEditable || currentFid == null || !picksData?.winners) return;
    const my = picksData.winners.find((w) => w.winner_fid === currentFid);
    if (my) {
      setPick1Fid(my.pick_1_fid != null ? String(my.pick_1_fid) : "");
      setPick2Fid(my.pick_2_fid != null ? String(my.pick_2_fid) : "");
    }
  }, [picksData, currentFid, picksEditable]);

  const handleSubmitPicks = async () => {
    if (!token || !picksEditable) return;
    const p1 = pick1Fid ? parseInt(pick1Fid, 10) : 0;
    const p2 = pick2Fid ? parseInt(pick2Fid, 10) : 0;
    const has1 = !isNaN(p1) && p1 > 0;
    const has2 = !isNaN(p2) && p2 > 0;
    setSubmittingPicks(true);
    setPicksError(null);
    try {
      const body: { roundId: string; pick1Fid?: number; pick2Fid?: number } = { roundId };
      if (has1) body.pick1Fid = p1;
      if (has2) body.pick2Fid = p2;
      const r = await authedFetch("/api/weekend-game/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setPicksError(d?.error || "Failed to save picks.");
        return;
      }
      setPick1Fid("");
      setPick2Fid("");
      fetchPicks();
      setPickPool([]);
      authedFetch(`/api/weekend-game/rounds/${roundId}/pick-pool`, { method: "GET" }, token)
        .then((res) => res.json())
        .then((data) => data?.ok && Array.isArray(data?.data?.pool) && setPickPool(data.data.pool))
        .catch(() => {});
    } catch (e) {
      setPicksError(e instanceof Error ? e.message : "Failed to save picks.");
    } finally {
      setSubmittingPicks(false);
    }
  };

  const myPicks = currentFid != null ? picksData?.winners?.find((w) => w.winner_fid === currentFid) : undefined;
  const poolLabel = (p: PoolPlayer) => p.display_name || p.username || `FID ${p.fid}`;
  const canSavePicks = picksEditable;

  return (
    <section style={{ marginTop: "16px", padding: "16px", background: "rgba(20, 184, 166, 0.12)", borderRadius: "8px", border: "1px solid rgba(20, 184, 166, 0.6)" }}>
      <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>Top 5 winners</h2>
      <p style={{ margin: 0, marginBottom: "8px", fontSize: "1rem", color: "var(--text-1)" }}>{ADVANTAGE_COPY}</p>
      <p style={{ margin: 0, marginBottom: "12px", fontSize: "0.875rem", color: "var(--text-1)", fontWeight: 600 }}>{BULLIED_RULE}</p>
      <p style={{ fontSize: "0.875rem", color: "var(--text-1)", marginBottom: "12px" }}>
        {picksEditable
          ? "You can change or clear your picks until the game is ended."
          : "Picks are locked; the game has ended."}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Pick 1</label>
          {picksEditable ? (
            <select
              value={pick1Fid}
              onChange={(e) => setPick1Fid(e.target.value)}
              style={{ padding: "8px", border: "1px solid #555", borderRadius: "6px", background: "var(--bg-2)", color: "var(--text-1)", width: "100%" }}
            >
              <option value="">— Choose from pool —</option>
              {pickPool.filter((p) => p.fid !== (pick2Fid ? parseInt(pick2Fid, 10) : 0)).map((p) => (
                <option key={p.fid} value={String(p.fid)}>{poolLabel(p)}</option>
              ))}
            </select>
          ) : (
            <p style={{ margin: 0, padding: "8px", background: "var(--bg-2)", borderRadius: "6px", fontSize: "0.875rem" }}>
              {myPicks?.pick_1_username ?? (myPicks?.pick_1_fid != null ? `FID ${myPicks.pick_1_fid}` : "—")}
            </p>
          )}
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Pick 2</label>
          {picksEditable ? (
            <select
              value={pick2Fid}
              onChange={(e) => setPick2Fid(e.target.value)}
              style={{ padding: "8px", border: "1px solid #555", borderRadius: "6px", background: "var(--bg-2)", color: "var(--text-1)", width: "100%" }}
            >
              <option value="">— Choose from pool —</option>
              {pickPool.filter((p) => p.fid !== (pick1Fid ? parseInt(pick1Fid, 10) : 0)).map((p) => (
                <option key={p.fid} value={String(p.fid)}>{poolLabel(p)}</option>
              ))}
            </select>
          ) : (
            <p style={{ margin: 0, padding: "8px", background: "var(--bg-2)", borderRadius: "6px", fontSize: "0.875rem" }}>
              {myPicks?.pick_2_username ?? (myPicks?.pick_2_fid != null ? `FID ${myPicks.pick_2_fid}` : "—")}
            </p>
          )}
        </div>
        {picksEditable && (
          <>
            <button onClick={handleSubmitPicks} disabled={submittingPicks} className="btn-primary" style={{ alignSelf: "flex-start" }}>
              {submittingPicks ? "Saving…" : "Save picks"}
            </button>
            {picksError && <p style={{ color: "var(--ember-2)", fontSize: "0.875rem" }}>{picksError}</p>}
          </>
        )}
      </div>
      {picksData?.winners && picksData.winners.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <h3 style={{ fontSize: "0.875rem", marginBottom: "8px" }}>Winner picks (live)</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Winner</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Pick 1</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Pick 2</th>
                </tr>
              </thead>
              <tbody>
                {picksData.winners.map((w) => (
                  <tr key={w.winner_fid} style={{ borderBottom: "1px solid #222" }}>
                    <td style={{ padding: "4px 8px" }}>{w.display_name || w.username || `FID ${w.winner_fid}`}</td>
                    <td style={{ padding: "4px 8px" }}>{w.pick_1_username ?? (w.pick_1_fid != null ? `FID ${w.pick_1_fid}` : "—")}</td>
                    <td style={{ padding: "4px 8px" }}>{w.pick_2_username ?? (w.pick_2_fid != null ? `FID ${w.pick_2_fid}` : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
